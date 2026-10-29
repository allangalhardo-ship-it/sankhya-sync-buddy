# Acerto com dados do roteirizador (sem foto no Sankhya)

## O que muda para o operador
1. Ao abrir a OC no acerto, cada nota já vem preenchida com o que o roteirizador registrou:
   - ENTREGUE / PARCIAL -> marcada como "Entregue"
   - DEVOLVIDO / PROBLEMA -> marcada como "Devolvido" (com o motivo do motorista visível)
   - PENDENTE / EM_ROTA ou sem registro -> fica sem marcação (operador decide, como hoje)
2. Cada nota mostra um botão "Ver canhoto" que abre o link da foto do roteirizador. Não precisa mais tirar foto.
3. Cada nota ganha uma caixinha "Conferido" — o operador vai marcando enquanto confere o papel. Se no papel estiver diferente, ele troca o status normalmente (Não Carregado e Devolução continuam abrindo as telas de justificativa/checklist que já existem).
4. Só dá para finalizar o acerto quando todas as notas estiverem "Conferido".
5. Nota "Entregue" sem link do roteirizador: continua permitindo tirar foto como plano B (só nesses casos).

## O que vai para o Sankhya
- Ao finalizar, em vez de subir a imagem no campo de imagem do AD_CANHOTOS, grava só o link (texto) da foto.
- O envio de imagem para o Sankhya (upload, reenvio em lote, migração) deixa de ser usado no fluxo normal.
- O status em AD_NFACERTO continua sendo gravado igual hoje.

## Precisa de você (uma vez)
- Criar no AD_CANHOTOS um campo texto para o link, ex.: `LINKCANHOTO` (VARCHAR 1000), pelo Dicionário de Dados. Eu te passo o passo a passo / script quando for a hora.
- Opcional: depois de validado, limpar as imagens antigas do campo CANHOTO2 para liberar espaço no banco (script que te mando para rodar no SSMS).

## Detalhes técnicos
- Fonte dos dados: tabelas que o projeto "Sankhya Delivery Sync" já grava no Sankhya — `AD_TRKNOTA` (SITUACAO, MOTIVODEVOL, NUNOTA) + `AD_TRKENTREGA` (LINKCOMPROV, LINKSIMAGEM). Regra: linha mais recente por NUNOTA (maior DTULTATIV/IDNOTA), pois a nota pode ter várias rotas.
- Nova action `getTracking` na função `sankhya-api`: recebe os NUNOTAs da OC e retorna `{NUNOTA, SITUACAO, MOTIVODEVOL, LINK}` via `DbExplorerSP.executeQuery` (usando ROW_NUMBER por NUNOTA). Alternativa: juntar direto na query de `getPedidos`.
- `Acerto.tsx`: pré-preenche status a partir do tracking (sem sobrescrever acertos já salvos), adiciona estado `conferido` por nota, botão "Ver canhoto", e troca a validação "Entregue precisa de canhoto" por "Entregue precisa de link OU foto" + "todas conferidas".
- Persistência local do acerto (tabela de itens) ganha coluna `conferido` e `link_canhoto` para recuperar o estado ao reabrir.
- `saveAcerto`/finalização: grava `LINKCANHOTO` via `CRUDServiceProvider.saveRecord` em AD_CANHOTOS (NUNOTA, NUMNOTA, CODPARC, VLRNOTA, DTNEG, CODVEND, LINKCANHOTO), sem `sessionUpload`.
- Teste: regra de mapeamento SITUACAO -> status do acerto e regra de bloqueio da finalização.

## Ponto a confirmar
- Se PARCIAL deve vir como "Entregue" ou "Devolução parcial" (abrindo o checklist de devolução). No plano está como "Entregue".
