const {test} = require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
function client(fetch){ const context={document:{querySelectorAll:()=>[],querySelector:()=>null},fetch}; vm.createContext(context); vm.runInContext(source,context); return context.GE; }
test('cliente não trata HTML de hospedagem estática como sucesso da API',async()=>{
 for(const status of [200,201]) {const ge=client(async()=>({status,json:async()=>{throw new SyntaxError('HTML')}})); assert.equal((await ge.api('POST','/api/denuncias',{})).status,0);}
});
test('cliente trata falha de conexão sem lançar erro para a tela',async()=>{
 const ge=client(async()=>{throw new TypeError('Sem conexão')}); assert.equal((await ge.api('GET','/api/sessao')).status,0);
});
test('cliente preserva erro JSON e sucesso sem conteúdo',async()=>{
 const ge=client(async()=>({status:400,json:async()=>({erro:'Confira os dados'})})); const r=await ge.api('POST','/api/denuncias',{}); assert.equal(r.status,400); assert.equal(r.corpo.erro,'Confira os dados');
 const semConteudo=client(async()=>({status:204})); assert.equal((await semConteudo.api('DELETE','/api/sessao')).status,204);
});
test('cliente rejeita JSON incompatível com o objeto de resposta da API',async()=>{
 for(const value of [null,[],true,'texto']) {const ge=client(async()=>({status:200,json:async()=>value})); assert.equal((await ge.api('GET','/api/sessao')).status,0);}
});
