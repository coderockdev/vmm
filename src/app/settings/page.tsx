import React from "react";

export const dynamic = "force-dynamic";

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "12px 0",
  borderBottom: "1px solid var(--border)",
};

export default function SettingsPage() {
  const aiProvider = process.env.AI_PROVIDER ?? "mock";
  const ttsProvider = process.env.TTS_PROVIDER ?? "cartesia";
  const renderProvider = process.env.RENDER_PROVIDER ?? "local";
  const hasCartesiaKey = Boolean(process.env.CARTESIA_API_KEY);
  const hasElevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY);
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasLambdaConfig = Boolean(
    process.env.REMOTION_LAMBDA_FUNCTION_NAME && process.env.REMOTION_LAMBDA_SERVE_URL
  );

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Configurações</h1>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Provedores (variáveis de ambiente)</div>
        <div style={rowStyle}>
          <span>AI_PROVIDER (roteiro, padrão)</span>
          <span style={{ color: "var(--text-dim)" }}>{aiProvider}</span>
        </div>
        <div style={rowStyle}>
          <span>ANTHROPIC_API_KEY (Claude)</span>
          <span style={{ color: hasAnthropicKey ? "var(--success)" : "var(--text-dim)" }}>
            {hasAnthropicKey ? "configurada" : "não configurada"}
          </span>
        </div>
        <div style={rowStyle}>
          <span>OPENAI_API_KEY (ChatGPT)</span>
          <span style={{ color: hasOpenAIKey ? "var(--success)" : "var(--text-dim)" }}>
            {hasOpenAIKey ? "configurada" : "não configurada"}
          </span>
        </div>
        <div style={rowStyle}>
          <span>GEMINI_API_KEY (Gemini)</span>
          <span style={{ color: hasGeminiKey ? "var(--success)" : "var(--text-dim)" }}>
            {hasGeminiKey ? "configurada" : "não configurada"}
          </span>
        </div>
        <div style={rowStyle}>
          <span>TTS_PROVIDER (padrão)</span>
          <span style={{ color: "var(--text-dim)" }}>{ttsProvider}</span>
        </div>
        <div style={rowStyle}>
          <span>CARTESIA_API_KEY</span>
          <span style={{ color: hasCartesiaKey ? "var(--success)" : "var(--text-dim)" }}>
            {hasCartesiaKey ? "configurada" : "não configurada"}
          </span>
        </div>
        <div style={rowStyle}>
          <span>ELEVENLABS_API_KEY</span>
          <span style={{ color: hasElevenLabsKey ? "var(--success)" : "var(--text-dim)" }}>
            {hasElevenLabsKey ? "configurada" : "não configurada"}
          </span>
        </div>
        <div style={rowStyle}>
          <span>RENDER_PROVIDER</span>
          <span style={{ color: "var(--text-dim)" }}>{renderProvider}</span>
        </div>
        {renderProvider === "lambda" && (
          <div style={rowStyle}>
            <span>Configuração Lambda</span>
            <span style={{ color: hasLambdaConfig ? "var(--success)" : "var(--danger)" }}>
              {hasLambdaConfig ? "configurada" : "faltando função/site"}
            </span>
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12 }}>
          Edite o arquivo <code>.env.local</code> na raiz do projeto e reinicie o servidor para aplicar mudanças.
          Cada geração também pode sobrepor a IA de roteiro (Claude ↔ ChatGPT ↔ Gemini ↔ Mock) e o motor de voz
          do canal (local ↔ Cartesia ↔ ElevenLabs) para comparar qual soa/escreve melhor.
        </p>
      </section>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Dados locais</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}>
          Banco de dados: <code>./data/vmm.sqlite</code>
          <br />
          Renders: <code>./data/channels/&#123;channelId&#125;/renders/</code>
          <br />
          Áudio: <code>./data/channels/&#123;channelId&#125;/audio/</code>
        </div>
      </section>
    </div>
  );
}
