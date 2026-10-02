const SHARED = [
  {
    name: "Chip Claro",
    amount: "R$21 · US$4.02",
    detail:
      "Crédito pré-pago de R$50 · US$9.58, válido por 120 dias. Juntos, R$71 · US$13.60. Câmbio de 1 out 2026: US$1 = R$5,22. Vale para a VMM inteira.",
  },
  {
    name: "Google Cloud Console",
    amount: "R$150 · US$28.74",
    detail:
      "Depósito para ativar a conta. Devolução pedida. Subir um vídeo pela API custa R$0 e não desconta esse valor. A cota é do projeto: 100 vídeos por dia, para todos os canais juntos. A capa sai das 10.000 consultas por dia.",
  },
];

const SUBSCRIPTIONS = [
  { account: "MY", name: "Cursor Pro+", monthly: 60, detail: "Plano Pro+. O valor mensal é US$ 60, não um extra em cima do Pro de US$ 20." },
  { account: "MY", name: "Claude", monthly: 20, detail: "Assinatura do chat." },
  { account: "MY", name: "ChatGPT", monthly: 20, detail: "Plus. Não inclui crédito da API." },
  { account: "MY", name: "HeyGen Creator", monthly: 29, detail: "Minutos dentro do navegador. A API não usa esse plano." },
  { account: "MY", name: "Suno", monthly: 10, detail: "Música." },
  {
    account: "MY",
    name: "Servidor Hetzner CX33",
    monthly: 10.59,
    detail: "Falkenstein. Compartilhado por todos os canais da VMM, não só Amor Amor.",
  },
];

export default function CostsPage() {
  const total = SUBSCRIPTIONS.reduce((sum, row) => sum + row.monthly, 0);
  const server = 10.59;

  return (
    <section className="costs-page">
      <h1>Custos</h1>
      <p className="lead">
        Assinaturas fixas da conta MY. Chip, crédito Claro e o depósito do Google Cloud são da VMM
        inteira e ficam abaixo, fora deste total mensal. Em cada canal, o gasto de um vídeo é o que
        se registou, partido por fornecedor e por tarefa: o texto e a imagem da OpenAI não se somam
        na mesma linha.
      </p>
      <table className="costs-table">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Assinatura</th>
            <th>Por mês</th>
          </tr>
        </thead>
        <tbody>
          {SUBSCRIPTIONS.map((row) => (
            <tr key={row.name}>
              <td>{row.account}</td>
              <td>
                {row.name}
                <div className="costs-note" style={{ marginTop: 4 }}>{row.detail}</div>
              </td>
              <td>US$ {row.monthly.toFixed(2)}</td>
            </tr>
          ))}
          <tr className="total">
            <td />
            <td>Total fixo</td>
            <td>US$ {total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <h2>Custos gerais da VMM</h2>
      <table className="costs-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {SHARED.map((row) => (
            <tr key={row.name}>
              <td>
                {row.name}
                <div className="costs-note" style={{ marginTop: 4 }}>{row.detail}</div>
              </td>
              <td>{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="costs-note">
        O servidor é uma mensalidade, não um custo de um vídeo. US$ {server.toFixed(2)} se divide por todos os vídeos
        que a VMM renderizar no mês. Em 100 vídeos, dá cerca de US$ {(server / 100).toFixed(2)} por vídeo. Esse rateio
        não entra no total de cada oração, para não parecer que Amor Amor pagou o servidor inteiro.
      </p>
    </section>
  );
}
