-- PMPlan — revisão do texto dos templates de email (tom mais formal) e assinatura da
-- Teresa Matos.
--
-- Substitui o texto de TODAS as linhas de email_templates (as 12: 3 tipos × PT/ES ×
-- radioterapia/braquiterapia) — incluindo edições que o admin tenha feito no editor.
-- A assinatura segue o bloco de remetente das cartas em PDF (lib/exporters/letterPdf.ts):
-- em PT "RRTS Unipessoal Lda", em ES "ELEKTA MEDICAL".
-- O "PS: por favor responda a todos" que o admin tinha acrescentado à carta PT passa a
-- fazer parte do texto das cartas (PT e ES): é o "Responder a todos" que leva a cópia
-- assinada à caixa documentos@ (CC), onde é arquivada automaticamente.
--
-- Formato do corpo: linha em branco = novo parágrafo, \n simples = <br> (ver textToHtml em
-- lib/proposalEmail.ts). Os placeholders {{ano}}, {{hospital}}, {{engenheiro}} e
-- {{tabela}} mantêm-se.

update email_templates as t
   set subject    = v.subject,
       body       = v.body,
       updated_at = now()
  from (values
    -- ─── Aprovação interna pelo engenheiro ────────────────────────────────────
    (
      'engineer_approval', 'PT',
      'Pedido de validação — Calendarização de Manutenções Preventivas {{ano}}',
      E'Olá {{engenheiro}},\n\nEnvio em baixo a proposta de calendarização das manutenções preventivas para {{ano}}, para tua validação.\n\n{{tabela}}\n\nAgradeço que confirmes se as datas propostas são exequíveis ou que me indiques as alterações necessárias, para que possamos avançar com o envio da proposta ao cliente.\n\nObrigada pela colaboração.\n\nCom os melhores cumprimentos,\nTeresa Matos\nCoordenação de Serviço Técnico\nRRTS Unipessoal Lda'
    ),
    (
      'engineer_approval', 'ES',
      'Solicitud de validación — Calendario de Mantenimientos Preventivos {{ano}}',
      E'Hola {{engenheiro}}:\n\nTe envío a continuación la propuesta de calendario de los mantenimientos preventivos para {{ano}}, para tu validación.\n\n{{tabela}}\n\nTe agradecería que confirmaras si las fechas propuestas son viables o que me indicaras los cambios necesarios, para poder avanzar con el envío de la propuesta al cliente.\n\nGracias por tu colaboración.\n\nUn saludo,\nTeresa Matos\nCoordinación de Servicio Técnico\nELEKTA MEDICAL'
    ),
    (
      'brachy_engineer_approval', 'PT',
      'Pedido de validação — Calendarização de Manutenções Preventivas de Braquiterapia {{ano}}',
      E'Olá {{engenheiro}},\n\nEnvio em baixo a proposta de calendarização das manutenções preventivas dos equipamentos de Braquiterapia para {{ano}}, para tua validação.\n\n{{tabela}}\n\nAgradeço que confirmes se as datas propostas são exequíveis ou que me indiques as alterações necessárias, para que possamos avançar com o envio da proposta ao cliente.\n\nObrigada pela colaboração.\n\nCom os melhores cumprimentos,\nTeresa Matos\nCoordenação de Serviço Técnico\nRRTS Unipessoal Lda'
    ),
    (
      'brachy_engineer_approval', 'ES',
      'Solicitud de validación — Calendario de Mantenimientos Preventivos de Braquiterapia {{ano}}',
      E'Hola {{engenheiro}}:\n\nTe envío a continuación la propuesta de calendario de los mantenimientos preventivos de los equipos de Braquiterapia para {{ano}}, para tu validación.\n\n{{tabela}}\n\nTe agradecería que confirmaras si las fechas propuestas son viables o que me indicaras los cambios necesarios, para poder avanzar con el envío de la propuesta al cliente.\n\nGracias por tu colaboración.\n\nUn saludo,\nTeresa Matos\nCoordinación de Servicio Técnico\nELEKTA MEDICAL'
    ),

    -- ─── Proposta ao cliente ──────────────────────────────────────────────────
    (
      'client_proposal', 'PT',
      'Proposta de calendarização — Manutenções Preventivas {{ano}} — {{hospital}}',
      E'Exmos. Senhores,\n\nVimos por este meio apresentar a proposta de calendarização das manutenções preventivas para {{ano}}, relativa aos equipamentos instalados no {{hospital}}.\n\n{{tabela}}\n\nSolicitamos a V. Exas. a confirmação das datas propostas ou, caso alguma não seja compatível com a atividade clínica, a indicação de datas alternativas, para que possamos proceder ao respetivo ajuste.\n\nMantemo-nos ao dispor para qualquer esclarecimento adicional.\n\nCom os melhores cumprimentos,\nTeresa Matos\nCoordenação de Serviço Técnico\nRRTS Unipessoal Lda'
    ),
    (
      'client_proposal', 'ES',
      'Propuesta de calendario — Mantenimientos Preventivos {{ano}} — {{hospital}}',
      E'Estimados señores:\n\nNos complace remitirles la propuesta de calendario de los mantenimientos preventivos para {{ano}} de los equipos instalados en {{hospital}}.\n\n{{tabela}}\n\nLes rogamos que nos confirmen las fechas propuestas o, en caso de que alguna no sea compatible con la actividad clínica, que nos indiquen fechas alternativas para proceder a su ajuste.\n\nQuedamos a su disposición para cualquier aclaración adicional.\n\nAtentamente,\nTeresa Matos\nCoordinación de Servicio Técnico\nELEKTA MEDICAL'
    ),
    (
      'brachy_client_proposal', 'PT',
      'Proposta de calendarização — Manutenções Preventivas de Braquiterapia {{ano}} — {{hospital}}',
      E'Exmos. Senhores,\n\nVimos por este meio apresentar a proposta de calendarização das manutenções preventivas para {{ano}}, relativa aos equipamentos de Braquiterapia instalados no {{hospital}}.\n\n{{tabela}}\n\nSolicitamos a V. Exas. a confirmação das datas propostas ou, caso alguma não seja compatível com a atividade clínica, a indicação de datas alternativas, para que possamos proceder ao respetivo ajuste.\n\nMantemo-nos ao dispor para qualquer esclarecimento adicional.\n\nCom os melhores cumprimentos,\nTeresa Matos\nCoordenação de Serviço Técnico\nRRTS Unipessoal Lda'
    ),
    (
      'brachy_client_proposal', 'ES',
      'Propuesta de calendario — Mantenimientos Preventivos de Braquiterapia {{ano}} — {{hospital}}',
      E'Estimados señores:\n\nNos complace remitirles la propuesta de calendario de los mantenimientos preventivos para {{ano}} de los equipos de Braquiterapia instalados en {{hospital}}.\n\n{{tabela}}\n\nLes rogamos que nos confirmen las fechas propuestas o, en caso de que alguna no sea compatible con la actividad clínica, que nos indiquen fechas alternativas para proceder a su ajuste.\n\nQuedamos a su disposición para cualquier aclaración adicional.\n\nAtentamente,\nTeresa Matos\nCoordinación de Servicio Técnico\nELEKTA MEDICAL'
    ),

    -- ─── Carta para assinatura ────────────────────────────────────────────────
    (
      'signature_letter', 'PT',
      'Confirmação de calendarização — Manutenções Preventivas {{ano}} — {{hospital}}',
      E'Exmos. Senhores,\n\nNa sequência da vossa aprovação, enviamos em anexo a carta com a calendarização das manutenções preventivas para {{ano}}.\n\nSolicitamos a devolução de uma cópia devidamente assinada, como confirmação da aceitação da calendarização, utilizando a opção «Responder a todos» deste email.\n\nAgradecemos desde já a vossa colaboração e mantemo-nos ao dispor para qualquer esclarecimento.\n\nCom os melhores cumprimentos,\nTeresa Matos\nCoordenação de Serviço Técnico\nRRTS Unipessoal Lda'
    ),
    (
      'signature_letter', 'ES',
      'Confirmación de calendario — Mantenimientos Preventivos {{ano}} — {{hospital}}',
      E'Estimados señores:\n\nTras su aprobación, les adjuntamos la carta con el calendario de los mantenimientos preventivos para {{ano}}.\n\nLes rogamos que nos devuelvan una copia debidamente firmada, como confirmación de la aceptación del calendario, utilizando la opción «Responder a todos» de este correo.\n\nAgradeciendo de antemano su colaboración, quedamos a su disposición para cualquier aclaración.\n\nAtentamente,\nTeresa Matos\nCoordinación de Servicio Técnico\nELEKTA MEDICAL'
    ),
    (
      'brachy_signature_letter', 'PT',
      'Confirmação de calendarização — Manutenções Preventivas de Braquiterapia {{ano}} — {{hospital}}',
      E'Exmos. Senhores,\n\nNa sequência da vossa aprovação, enviamos em anexo a carta com a calendarização das manutenções preventivas dos equipamentos de Braquiterapia para {{ano}}.\n\nSolicitamos a devolução de uma cópia devidamente assinada, como confirmação da aceitação da calendarização, utilizando a opção «Responder a todos» deste email.\n\nAgradecemos desde já a vossa colaboração e mantemo-nos ao dispor para qualquer esclarecimento.\n\nCom os melhores cumprimentos,\nTeresa Matos\nCoordenação de Serviço Técnico\nRRTS Unipessoal Lda'
    ),
    (
      'brachy_signature_letter', 'ES',
      'Confirmación de calendario — Mantenimientos Preventivos de Braquiterapia {{ano}} — {{hospital}}',
      E'Estimados señores:\n\nTras su aprobación, les adjuntamos la carta con el calendario de los mantenimientos preventivos de los equipos de Braquiterapia para {{ano}}.\n\nLes rogamos que nos devuelvan una copia debidamente firmada, como confirmación de la aceptación del calendario, utilizando la opción «Responder a todos» de este correo.\n\nAgradeciendo de antemano su colaboración, quedamos a su disposición para cualquier aclaración.\n\nAtentamente,\nTeresa Matos\nCoordinación de Servicio Técnico\nELEKTA MEDICAL'
    )
  ) as v(key, country, subject, body)
 where t.key = v.key
   and t.country = v.country;
