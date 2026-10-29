# Acerto com dados do roteirizador (sem foto no Sankhya) - v2

## O que muda para o operador
1. Ao abrir a OC no acerto, cada nota já vem preenchida com o que o roteirizador (Lincros) registrou **na rota desta OC**:
   - ENTREGUE -> marcada como "Entregue"
   - PARCIAL -> marcada como "Devolvido", abrindo o checklist de devolução já com tipo "parcial"
   - DEVOLVIDO / PROBLEMA -> marcada como "Devolvido" (com o motivo do motorista visível)
   - PENDENTE / EM_ROTA ou sem registro -> fica sem marcação (operador decide pelo papel, como hoje)
   - Nunca sobrescrever um acerto que já foi salvo.
2. Cada nota mostra um botão "Ver canhoto" **somente quando existir foto do canhoto** (campo LINKSIMAGEM). O "PDF" do roteirizador (LINKCOMPROV) NÃO deve ser usado nem exibido: ele aparece em toda nota, mesmo sem entrega, e não comprova nada.
3. Cada nota ganha uma caixinha "Conferido". O operador marca enquanto confere o papel. Se no papel estiver diferente, troca o status normalmente (Não Carregado e Devolução continuam abrindo as telas de justificativa/checklist que já existem).
4. Só dá para finalizar o acerto quando todas as notas estiverem "Conferido".
5. Nota "Entregue" sem foto do canhoto no roteirizador: permite tirar foto como plano B (só nesses casos).

## O que vai para o Sankhya
- AD_CANHOTOS: ao finalizar, grava só o link (texto) da foto no campo novo LINK_CANHOTO, em vez da imagem no CANHOTO2. Sem sessionUpload.
- O envio de imagem para o Sankhya (upload, reenvio em lote, migração) deixa de ser usado no fluxo normal.
- AD_NFACERTO: continua gravando STATUS igual hoje e passa a gravar também os campos novos:
  - CONFERIDO (S/N), CODUSUCONF (usuário do app que conferiu, texto) e DHCONF (data/hora)
  - ORIGEMSTATUS: 'L' quando o status final é o mesmo que veio do roteirizador, 'M' quando o operador marcou ou trocou à mão
  - CODMOTDEV (código do motivo da devolução, de AD_MOTDEV) e TIPODEV ('P' parcial / 'T' total), vindos do checklist de devolução que hoje fica só no Supabase

## Detalhes técnicos
- Fonte: tabelas que o projeto de tracking já grava no Sankhya. Ligação com a OC pela rota: AD_TRKROTA.CODROTANEG = número da OC (texto).
- Nova action `getTracking` na função `sankhya-api`, recebendo o número da OC:

```sql
SELECT NUNOTA, SITUACAO, MOTIVO, LINKSIMAGEM
FROM (
  SELECT N.NUNOTA, N.SITUACAO,
         COALESCE(E.MOTIVOCENTRAL, E.MOTIVOMOTORIS, N.MOTIVODEVOL) AS MOTIVO,
         E.LINKSIMAGEM,
         ROW_NUMBER() OVER (PARTITION BY N.NUNOTA ORDER BY N.IDNOTA DESC) AS RN
  FROM AD_TRKROTA R
  JOIN AD_TRKENTREGA E ON E.IDROTA = R.IDROTA
  JOIN AD_TRKNOTA N    ON N.IDENTREGA = E.IDENTREGA
  WHERE R.CODROTANEG = '<OC>'
    AND N.NUNOTA IS NOT NULL
) X
WHERE RN = 1
```
  - Não usar "linha mais recente por NUNOTA" sem filtrar a rota: na reentrega a linha mais recente é de outra OC.
  - DTULTATIV não existe na AD_TRKNOTA (só na AD_TRKROTA); o desempate é pelo maior IDNOTA.
  - LINKSIMAGEM pode trazer vários links separados por " | ": usar o primeiro (mesma regra do portal, função primeiroLink em src/lib/portal.server.ts do projeto de tracking).
- `Acerto.tsx`: pré-preenche status a partir do tracking, adiciona estado `conferido` por nota, botão "Ver canhoto", troca a validação "Entregue precisa de canhoto" por "Entregue precisa de foto do roteirizador OU foto tirada" + "todas conferidas".
- Persistência local do acerto (tabela de itens) ganha colunas `conferido`, `link_canhoto` e `origem_status` para recuperar o estado ao reabrir.
- `saveAcerto`/finalização: grava LINK_CANHOTO via `CRUDServiceProvider.saveRecord` em AD_CANHOTOS (NUNOTA, NUMNOTA, CODPARC, VLRNOTA, DTNEG, CODVEND, LINK_CANHOTO) e os campos novos da AD_NFACERTO.
- Formato dos campos novos ao gravar via CRUDServiceProvider: CONFERIDO 'S'/'N'; DHCONF como texto "dd/MM/yyyy HH:mm:ss" (mesmo padrão do formatDtnegForCrud, com hora); ORIGEMSTATUS 'L'/'M'; TIPODEV 'P'/'T'; CODMOTDEV inteiro (código de AD_MOTDEV, hoje o checklist guarda o texto "CODIGO - DESCRICAO": gravar só o CODIGO).
- Teste: regra de mapeamento SITUACAO -> status do acerto e regra de bloqueio da finalização.

## Precisa do Allan (uma vez, antes de publicar)
- Criar os campos novos pelo Dicionário de Dados: AD_CANHOTOS.LINK_CANHOTO (já criado) e, na AD_NFACERTO, CONFERIDO, CODUSUCONF, DHCONF, ORIGEMSTATUS, CODMOTDEV, TIPODEV.
- NÃO limpar o CANHOTO2 agora: as fotos antigas podem existir só no Sankhya. Limpeza fica para depois de exportar as imagens.
