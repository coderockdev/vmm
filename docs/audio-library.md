# Biblioteca de Áudio da VMM

Biblioteca **interna** de músicas instrumentais e SFX.

## Fonte recomendada

[Biblioteca de Áudio do YouTube](https://www.youtube.com/audiolibrary)

- Preferir faixas **“Atribuição não necessária”** (`attributionRequired: false`)
- Só músicas **100% instrumentais** (sem vocal / letra)
- SFX pelas categorias do YouTube (telefone, chuva, vento, etc.)

## O que NÃO fazer

- Não baixar automaticamente áudio de páginas aleatórias da internet
- Não usar faixas sem licença registada no `catalog.json`

## Como adicionar

1. Descarrega o MP3 da YouTube Audio Library
2. Copia para `data/audio-library/music/` ou `data/audio-library/sfx/`
3. Adiciona entrada em `data/audio-library/catalog.json`
4. Reinicia o `npm run dev`

## Seed local (placeholders)

```bash
npm run seed:audio-library
```

Gera stubs de desenvolvimento até chegarem as faixas reais do YouTube.

## SQL Supabase

Correr no SQL Editor:

```sql
alter table video_projects add column if not exists video_style_json jsonb;
alter table video_projects add column if not exists audio_bed_json jsonb;
```
