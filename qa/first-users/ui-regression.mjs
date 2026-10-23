// Supplemental mechanical UI regressions, NOT the eight blind Browser MCP persona runs.
// Browser/CUA is not exposed in this execution environment. Use a fresh Playwright Chromium.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const artifacts=resolve(import.meta.dirname,'artifacts');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
const freshContext=async(port)=>{
  const context=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===`http://127.0.0.1:${port}` ? route.continue() : route.abort());
  return context;
};
const login=async(page,port)=>{
  await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle',timeout:120000});
  await page.getByRole('link',{name:/Google профиль/}).click();
  await page.getByRole('button',{name:'Продолжить тестовый вход',exact:true}).click();
  // Cold fixture assets are deliberately no-store; under500kbps a new OAuth
  // document may need another complete bundle download. No30s speed SLA is implied.
  await expect(page.getByRole('button',{name:'Создать AI-план',exact:true})).toBeVisible({timeout:120000});
};
let activeContext;
try {
  activeContext=await freshContext(4270);
  await activeContext.tracing.start({screenshots:true,snapshots:true});
  const page=await activeContext.newPage(); const mutationCounts={profile:0,ai:0};
  page.on('request',r=>{const p=new URL(r.url()).pathname;if(p==='/api/profile'&&r.method()==='PUT')mutationCounts.profile++;if(p==='/api/ai'&&r.method()==='POST')mutationCounts.ai++;});
  await login(page,4270);
  const create=page.getByRole('button',{name:'Создать AI-план',exact:true});
  const createBox=await create.boundingBox();
  expect(createBox.y).toBeGreaterThanOrEqual(0); expect(createBox.y+createBox.height).toBeLessThanOrEqual(812);
  const age=page.getByRole('spinbutton',{name:'Возраст',exact:true});
  await age.fill('999');
  await expect(create).toBeDisabled();
  await expect(page.locator('#registration-age-help')).toContainText('от 1 до 130');
  await expect(page.getByText('AI Инициализация',{exact:true})).toHaveCount(0);
  expect(mutationCounts).toEqual({profile:0,ai:0});
  await page.screenshot({path:resolve(artifacts,'regression-age999.png')});
  await page.goBack({waitUntil:'networkidle'});
  await page.goForward({waitUntil:'networkidle'});
  await expect(age).toHaveValue('999');
  await expect(create).toBeDisabled();
  await age.fill('31');
  const intensity=page.getByRole('spinbutton',{name:'Дефицит (ккал/день)',exact:true});
  await intensity.fill('1000');
  const ack=page.getByRole('checkbox',{name:/Я понимаю риски/});
  await expect(ack).toBeVisible(); await expect(create).toBeDisabled();
  await ack.check(); await expect(create).toBeEnabled();
  await age.fill('32'); await expect(ack).not.toBeChecked(); await expect(create).toBeDisabled();
  await ack.check(); await page.reload({waitUntil:'networkidle'});
  await expect(age).toHaveValue('32'); await expect(intensity).toHaveValue('1000');
  await expect(ack).not.toBeChecked(); await expect(create).toBeDisabled();
  expect(mutationCounts).toEqual({profile:0,ai:0});
  await intensity.fill('500'); await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole('heading',{name:/Ваш AI/})).toBeVisible({timeout:30000});
  await expect(page.getByText('1800 ккал',{exact:true})).toBeVisible();
  const kpiBox=await page.getByText('KPI на день',{exact:true}).boundingBox();
  expect(kpiBox.y).toBeGreaterThanOrEqual(0); expect(kpiBox.y).toBeLessThan(812);
  await page.screenshot({path:resolve(artifacts,'regression-mobile-plan.png')});
  await page.reload({waitUntil:'networkidle'});
  if(!await page.getByRole('heading',{name:/Ваш AI/}).isVisible())await page.getByRole('button',{name:'План',exact:true}).click();
  await expect(page.getByText('1800 ккал',{exact:true})).toBeVisible();
  results.push({case:'functional',pass:true,viewport:'375x812',checks:['CTA visible initially','age999 blocked before AI/profile','BackForward draft','goal-risk control','edited inputs revoke consent','reload requires reconfirmation','plan saved afterreload'],mutationCounts});
  await writeFile(resolve(import.meta.dirname,'functional-regression-results.json'),JSON.stringify(results[0],null,2)+'\n');
  await activeContext.tracing.stop({path:resolve(artifacts,'regression-ui-trace.zip')});
  await activeContext.close(); activeContext=null;
  for(const [stage,port] of [['before',4280],['after',4271]]) {
    activeContext=await freshContext(port);
    const page=await activeContext.newPage();
    const cdp=await activeContext.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:500000/8,uploadThroughput:500000/8,connectionType:'cellular3g'});
    await login(page,port);
    const create=page.getByRole('button',{name:'Создать AI-план',exact:true});
    await create.click();
    await expect(page.getByRole('heading',{name:/Ваш AI/})).toBeVisible({timeout:60000});
    await expect(page.getByText('1800 ккал',{exact:true})).toBeVisible();
    // Record layout without scrolling to the KPI; no persona score or timing comparison.
    const kpi=await page.getByText('KPI на день',{exact:true}).boundingBox();
    await page.screenshot({path:resolve(artifacts,`${stage}-375-network.png`)});
    results.push({case:`${stage}-network`,pass:true,viewport:'375x812',latencyMs:400,downloadBitsPerSecond:500000,uploadBitsPerSecond:500000,kpiTop:kpi.y,serviceWorkers:'blocked',realProviderCalls:false});
    await activeContext.close(); activeContext=null;
  }
  await writeFile(resolve(import.meta.dirname,'ui-regression-results.json'),JSON.stringify({supplemental:true,personaRuns:false,results},null,2)+'\n');
  console.log(JSON.stringify({pass:true,results}));
} catch(error) {
  await writeFile(resolve(import.meta.dirname,'ui-regression-results.json'),JSON.stringify({supplemental:true,personaRuns:false,pass:false,results,error:String(error)},null,2)+'\n');
  if(activeContext){const page=activeContext.pages()[0];if(page)await page.screenshot({path:resolve(artifacts,'regression-failure.png')}).catch(()=>{});await activeContext.tracing.stop({path:resolve(artifacts,'regression-failure-trace.zip')}).catch(()=>{});}
  console.error(error); process.exitCode=1;
} finally { await activeContext?.close();await browser.close(); }
