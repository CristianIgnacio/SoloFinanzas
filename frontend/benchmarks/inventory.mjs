import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..');
function walk(path) { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(path, e.name)) : /\.tsx?$/.test(e.name) ? [resolve(path, e.name)] : []); }
const files = walk(resolve(root, 'src')).map(path => ({ path, source: ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true) }));
const calls = [], endpoints = [];
for (const { path, source } of files) {
  const file = relative(root, path).replaceAll('\\', '/');
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(source), method = node.expression.name.text;
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (/Service$/.test(receiver)) calls.push({ method: `${receiver}.${method}`, file, line });
      if (receiver === 'apiClient') {
        let parent = node.parent, owner = null;
        while (parent) {
          if (ts.isMethodDeclaration(parent)) { owner = parent.name.getText(source); break; }
          if (ts.isPropertyAssignment(parent)) { owner = parent.name.getText(source); break; }
          parent = parent.parent;
        }
        const service = file.startsWith('src/services/') ? file.split('/').at(-1).replace('.ts', '').replace(/^./, c => c.toUpperCase()) : null;
        endpoints.push({ verb: method === 'postForm' ? 'POST' : method.toUpperCase(), endpoint: node.arguments[0]?.getText(source), file, line, method: service && owner ? `${service}.${owner}` : null });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const text = [
  '**Inventario HTTP del frontend — generado desde TypeScript**', '',
  'Regenerar: `node benchmarks/inventory.mjs` desde frontend. Incluye todos los usos de apiClient, incluso llamadas directas. Los consumidores en src/query son opciones preparadas, todavía no conectadas a pantallas.', '',
  '| Método | Endpoint | Definición | Consumidores |', '| --- | --- | --- | --- |',
  ...endpoints.map(e => `| ${e.verb} | ${e.endpoint?.replaceAll('|', '\\|')} | ${e.file}:${e.line}${e.method ? ` (${e.method})` : ''} | ${e.method ? calls.filter(c => c.method === e.method).map(c => `${c.file}:${c.line}`).join('<br>') || 'Sin consumidor directo encontrado' : 'Llamada directa en la definición'} |`), '',
  `Total: ${endpoints.length} puntos de transporte (${endpoints.filter(e => e.verb === 'GET').length} GET; ${endpoints.filter(e => e.verb !== 'GET').length} operaciones restantes).`, '',
  'Alcance: inventario estático de apiClient, no de todo el tráfico del navegador. Supabase Auth, Vercel Analytics, assets y llamadas internas del backend quedan fuera. Los POST de preview procesan datos sin equivaler necesariamente a una escritura persistida. Los GET de /me y propuestas/patrones pueden aprovisionar/sincronizar datos: revisar sus efectos antes de añadir reintentos.', '',
].join('\n');
writeFileSync(resolve(root, '../docs/inventario-http-frontend.md'), text);
console.log(`${endpoints.length} transport calls inventoried`);
