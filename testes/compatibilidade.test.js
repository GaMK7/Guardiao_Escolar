const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./apoio');
let env;
before(async () => {
  env = await iniciar();
  await env.criarUsuario({email:'navegador@exemplo.test',nome:'Teste de navegador',perfil:'administrador',senha:'senha-de-teste-123'});
});
after(async()=> { if (env) await env.parar(); });
test('páginas públicas entregam HTML, viewport e seus arquivos CSS e JS existentes', async () => {
  for (const path of ['/', '/index.html','/denuncia.html','/consultar.html','/confirmacao.html','/andamento.html','/informacoes.html','/admin/login.html']) {
    const r=await env.pedir('GET',path);
    assert.equal(r.status,200,path);
    assert.match(r.cabecalhos.get('content-type'),/text\/html/);
    assert.match(r.texto,/name="viewport"/);
    for(const match of r.texto.matchAll(/(?:href|src)="([^"]+\.(?:css|js|svg))"/g)) {
      const asset=new URL(match[1],env.base+path).pathname;
      assert.equal((await env.pedir('GET',asset)).status,200,asset);
    }
  }
});
test('CSS e JS têm tipos de conteúdo adequados para nosniff',async()=>{
 for(const [path,type] of [['/css/estilo.css',/text\/css/],['/js/app.js',/(?:text|application)\/javascript/],['/js/admin.js',/(?:text|application)\/javascript/]]) {
  const r=await env.pedir('GET',path); assert.equal(r.status,200); assert.match(r.cabecalhos.get('content-type'),type);
 }
});
test('API mantém contrato JSON e no-store com agentes de navegador diferentes',async()=>{
 for(const ua of ['Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36']) {
  const r=await env.pedir('POST','/api/denuncias',{cabecalhos:{'User-Agent':ua},corpo:{tipo:'outro',descricao:'Teste fictício de compatibilidade.',data_ocorrencia:'2026-03-12',local:'outro'}});
  assert.equal(r.status,201); assert.match(r.cabecalhos.get('content-type'),/application\/json/); assert.equal(r.cabecalhos.get('cache-control'),'no-store');
  const consulta=await env.pedir('POST','/api/denuncias/consulta',{corpo:{codigo:r.corpo.codigo},cabecalhos:{'User-Agent':ua}});
  assert.equal(consulta.status,200); assert.equal(consulta.corpo.protocolo,r.corpo.protocolo);
 }
});
test('JSON malformado e corpo excessivo retornam erro JSON sem cache',async()=>{
 for(const [body,status] of [['{"tipo":',400],[JSON.stringify({descricao:'x'.repeat(11000)}),413]]) {
  const r=await fetch(env.base+'/api/denuncias',{method:'POST',headers:{'Content-Type':'application/json'},body});
  assert.equal(r.status,status); assert.equal(r.headers.get('cache-control'),'no-store'); assert.ok((await r.json()).erro);
 }
});
test('login por formulário sem JavaScript define cookie e redireciona',async()=>{
 const r=await env.pedir('POST','/api/sessao',{form:{email:'navegador@exemplo.test',senha:'senha-de-teste-123'}});
 assert.equal(r.status,303); assert.equal(r.cabecalhos.get('location'),'/denuncias.html'); assert.match(r.setCookie,/HttpOnly/);
 assert.equal((await env.pedir('GET','/denuncias.html',{cookie:r.cookie})).status,200);
});
