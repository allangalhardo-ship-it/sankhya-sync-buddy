# Corrigir canhoto trocado entre notas no acerto

## O que muda para o operador
1. Ao lado de "Ver canhoto", cada nota ganha o botão **"Trocar canhoto"**.
2. Ele abre uma janela com as fotos de todas as notas da mesma OC (miniatura + número da nota), para o operador ver qual foto é de qual nota.
3. O operador escolhe a foto certa e o app **troca** os links entre as duas notas: a nota 10 fica com a foto que estava na 11, e a 11 fica com a da 10. Assim nenhuma nota fica sem foto e nenhuma foto aparece duas vezes.
4. Na janela também dá para **tirar uma foto nova** para a nota, se a certa não estiver em nenhuma outra.
5. A nota alterada mostra um aviso "Canhoto ajustado" e, se o operador ainda não tinha marcado, a caixinha "Conferido" é desmarcada nas duas notas, para que ele confira de novo.
6. Ao finalizar, cada nota grava no Sankhya (AD_CANHOTOS.LINK_CANHOTO) o link já corrigido.

## Regras
- A troca só vale para notas da mesma OC.
- Se o roteirizador mandar o link de novo quando a OC for reaberta, o link que o operador ajustou continua valendo (não é sobrescrito).
- Só o link vai para o Sankhya, nunca a imagem.

## Detalhes técnicos
- `Acerto.tsx`: novo diálogo "Trocar canhoto" que lista os `link_canhoto` das outras notas da OC; a troca faz um swap no estado e marca `canhoto_ajustado` nas duas notas.
- O estado salvo da tela (tabela de itens do acerto) ganha a coluna `canhoto_ajustado`. Ao reabrir, se ela for verdadeira, o link salvo vale mais que o do getTracking.
- A regra de swap fica em `src/lib/tracking.ts` (`trocarCanhoto`), com teste: a troca entre a nota A e a B inverte os links, e nenhum link fica duplicado.
- A gravação por saveLinkCanhotos não muda; ela só passa a usar o link corrigido.
