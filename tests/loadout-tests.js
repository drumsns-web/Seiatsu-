(async () => {
  const R = [], ok = (name, yes, detail) => R.push((yes ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' [' + detail + ']'));
  const M = G.Game, P = G.Player, Menu = G.Menu;
  M.fullscreen = false; G.Touch.setMode('on');
  M.state = 'menu'; M.loadoutReady = false; Menu.show('main');
  document.getElementById('btn-start').click();
  ok('出撃する前に装備画面を開く', document.getElementById('panel-loadout').classList.contains('on') && M.state === 'menu');
  const selectCount = n => { const radio = document.querySelector(`input[name="lo-allies"][value="${n}"]`); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); };
  selectCount(1);
  ok('ALPHAだけを同行させられる', M.allyCount === 1 && G.Allies.list.length === 1 && G.Allies.list[0].name === 'ALPHA');
  ok('1人同行時BRAVO指示を無効化', document.querySelector('#squad-select [data-squad="bravo"]').disabled);
  selectCount(0); ok('単独出撃を選べる', M.allyCount === 0 && G.Allies.list.length === 0);
  selectCount(2); ok('ALPHAとBRAVOを選べる', M.allyCount === 2 && G.Allies.list.length === 2);
  selectCount(1);
  const plus = document.querySelector('[data-med="medicine"][data-d="1"]'), before = M.loadout.med.medicine;
  plus.click();
  ok('出撃前に治療薬の数を選べる', M.loadout.med.medicine === before + 1 && document.getElementById('lo-medicine').textContent === String(before + 1));
  ok('装備と同行人数が出撃前の要約に出る', document.getElementById('loadout-sum').textContent.includes('同行：ALPHA') && document.getElementById('loadout-sum').textContent.includes('治療薬×'));
  document.getElementById('btn-deploy').click();
  ok('装備を確定してから出撃する', M.state === 'playing' && M.loadoutReady && P.med.medicine === before + 1 && G.Allies.list.length === 1);
  G.Enemies.list.forEach(e => { e.update = () => {}; });
  P.hp = 40; P.wounds = []; P.startTreat(); M.step(120);
  ok('出血がなければ治療薬で体力を30回復', P.hp === 70 && P.med.medicine === before, `${P.hp}/${P.med.medicine}`);
  M.state = 'paused'; Menu.show('pause'); document.getElementById('btn-restart').click();
  ok('再出撃前にも装備画面へ戻る', M.state === 'menu' && !M.loadoutReady && document.getElementById('panel-loadout').classList.contains('on'));
  return R.join('\n') + '\n' + R.filter(x => x.startsWith('PASS')).length + '/' + R.length + ' PASS';
})()
