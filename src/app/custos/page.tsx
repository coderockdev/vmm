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
        Assinaturas fixas da conta MY. O que cada vídeo gasta de voz e de modelo aparece no painel do canal, separado disto.
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
      <p className="costs-note">
        O servidor é uma mensalidade, não um custo de um vídeo. US$ {server.toFixed(2)} se divide por todos os vídeos
        que a VMM renderizar no mês. Em 100 vídeos, dá cerca de US$ {(server / 100).toFixed(2)} por vídeo. Esse rateio
        não entra no total de cada oração, para não parecer que Amor Amor pagou o servidor inteiro.
      </p>
    </section>
  );
}
