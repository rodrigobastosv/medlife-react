/**
 * Ponto de entrada da página de especímenes (/preview.html, só em dev).
 *
 * Os componentes vivem em `preview-specimens.tsx`; aqui só o mount, para o
 * arquivo de entrada não exportar componente nenhum — é a mesma regra de Fast
 * Refresh que `theme-context.ts` explica.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import './index.css';

import { ThemeColumn } from '@/preview-specimens';

const root = document.getElementById('preview-root');
if (root === null) throw new Error('#preview-root não existe em preview.html');

createRoot(root).render(
  <StrictMode>
    {/* MemoryRouter porque AppointmentTile é um <Link>: precisa de um router,
        mas não de URL de verdade nesta página. */}
    <MemoryRouter>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <ThemeColumn label="Tema claro" isDark={false} />
        <ThemeColumn label="Tema escuro" isDark />
      </div>
    </MemoryRouter>
  </StrictMode>,
);
