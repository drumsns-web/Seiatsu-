// 欠損用の形状。読み込み時に一度だけ、三角形を部位ごとに分けておく（命中時は外れる部位だけを固い形にする）。
// 部位：顔の上半分・上腕・前腕（肘から先）・太もも・すねから下。
'use strict';
(function(){
 const cache=new WeakMap(),G=window.G;
 // 骨 → 細かい部位
 const region=n=>n==='head'?'head':/^ua[LR]$/.test(n)?'ua'+n.slice(-1):/^(fa|hd)[LR]$/.test(n)?'fore'+n.slice(-1):/^th[LR]$/.test(n)?'th'+n.slice(-1):/^(sn|ft)[LR]$/.test(n)?'shin'+n.slice(-1):'core';
 const GROUPS=['core','head','uaL','foreL','uaR','foreR','thL','shinL','thR','shinR'];
 // 欠損の単位 → 含む部位
 const KEYS={head:['head'],foreL:['foreL'],foreR:['foreR'],armL:['uaL','foreL'],armR:['uaR','foreR'],legL:['thL','shinL'],legR:['thR','shinR']};
 G.SeverGeometry={
  KEYS,
  prepare(geo,bones){
   if(cache.has(geo))return cache.get(geo);
   const si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight,idx=si.clone(),weights=sw.clone(),byRegion=Object.fromEntries(GROUPS.map(k=>[k,[]]));
   const names=bones.map(b=>region(b.name));
   const indexOf=Object.fromEntries(GROUPS.map(g=>[g,bones.findIndex(b=>region(b.name)===g)]));
   const headBone=bones.find(b=>b.name==='head');
   const cutY=headBone ? headBone.getWorldPosition(new THREE.Vector3()).y+.072 : 1.712;
   const py=geo.attributes.position;
   for(let i=0;i<si.count;i+=3){
    const sum=Object.fromEntries(GROUPS.map(k=>[k,0]));
    for(let v=i;v<i+3;v++)for(let k=0;k<4;k++)sum[names[si.array[v*4+k]]]+=sw.array[v*4+k];
    const owner=GROUPS.reduce((a,b)=>sum[b]>sum[a]?b:a);
    // 頭部は目と鼻の高さより上だけを取り除く。顎・口元・首は骨と共に残す。
    const centerY=(py.getY(i)+py.getY(i+1)+py.getY(i+2))/3;
    const centerX=(py.getX(i)+py.getX(i+1)+py.getX(i+2))/3;
    const centerZ=(py.getZ(i)+py.getZ(i+1)+py.getZ(i+2))/3;
    const tornY=cutY+.019*Math.sin(centerX*49)+.011*Math.cos(centerZ*57)+.006*centerX/.1;
    const cutOwner=owner==='head' && centerY<tornY?'core':owner;
    byRegion[cutOwner].push(i,i+1,i+2);
    // 三角形が属する部位以外の骨の影響を外す（外れた後に、残った体の形が引っ張られないように）
    for(let v=i;v<i+3;v++){
     let total=0;for(let k=0;k<4;k++){if(names[idx.array[v*4+k]]!==owner)weights.array[v*4+k]=0;total+=weights.array[v*4+k];}
     if(total>0)for(let k=0;k<4;k++)weights.array[v*4+k]/=total;
     else {idx.setXYZW(v,Math.max(0,indexOf[owner]),0,0,0);weights.setXYZW(v,1,0,0,0);}
    }
   }
   const result={byRegion,source:geo,skinIndex:idx,skinWeight:weights,remainingCache:new Map()};
   for(const key in KEYS){
    const cut=[].concat(...KEYS[key].map(g=>byRegion[g])),removed=new Set(cut);
    const partGroups=[];let offset=0;for(const g of geo.groups){let count=0;for(let i=g.start;i<g.start+g.count;i++)if(removed.has(i))count++;if(count)partGroups.push({start:offset,count,materialIndex:g.materialIndex});offset+=count;}
    result[key]={indices:cut,groups:partGroups};
   }
   cache.set(geo,result);
   // よく使う「1か所だけ外れた形」は先に作っておく（命中した瞬間に重い処理をしない）
   for(const key in KEYS)G.SeverGeometry.remaining({cutGeometry:result},[key]);
   return result;
  },
  // いくつかの部位が外れた後の、残りの体の形（同じ組み合わせは作り直さない）
  remaining(h,keys){
   const c=h.cutGeometry,id=[...new Set(keys)].sort().join('+');
   if(c.remainingCache.has(id))return c.remainingCache.get(id);
   const geo=c.source,removed=new Set();for(const k of keys)for(const i of c[k].indices)removed.add(i);
   const out=new THREE.BufferGeometry();
   for(const [name,attr]of Object.entries(geo.attributes))out.setAttribute(name,name==='skinIndex'?c.skinIndex:name==='skinWeight'?c.skinWeight:attr);
   const keep=[];for(let i=0;i<geo.attributes.position.count;i++)if(!removed.has(i))keep.push(i);
   out.setIndex(keep);
   let offset=0;for(const g of geo.groups){let count=0;for(let i=g.start;i<g.start+g.count;i++)if(!removed.has(i))count++;if(count)out.addGroup(offset,count,g.materialIndex);offset+=count;}
   out.boundingSphere=geo.boundingSphere;
   c.remainingCache.set(id,out);return out;
  },
  // 外れる部位を、今の姿勢のまま固い形にする（剛体 body の座標で）
  bake(h,key,body){
   const c=h.cutGeometry,cut=c[key],src=c.source,indices=cut.indices;
   const positions=new Float32Array(indices.length*3),normals=new Float32Array(indices.length*3),uv=new Float32Array(indices.length*2);
   h.root.updateMatrixWorld(true);h.mesh.skeleton.update();
   const world=new THREE.Matrix4().compose(new THREE.Vector3(body.position.x,body.position.y,body.position.z),new THREE.Quaternion(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w),new THREE.Vector3(1,1,1));
   const toLocal=world.invert().multiply(h.mesh.matrixWorld).multiply(h.mesh.bindMatrixInverse);
   const v=new THREE.Vector3(),n=new THREE.Vector3(),base=new THREE.Vector3(),normal=new THREE.Vector3(),sum=new THREE.Vector3(),nsum=new THREE.Vector3(),m=new THREE.Matrix4();
   const a=c.skinIndex.array,w=c.skinWeight.array;
   for(let i=0;i<indices.length;i++){
    const j=indices[i];base.fromBufferAttribute(src.attributes.position,j).applyMatrix4(h.mesh.bindMatrix);normal.fromBufferAttribute(src.attributes.normal,j);sum.set(0,0,0);nsum.set(0,0,0);
    for(let k=0;k<4;k++){const weight=w[j*4+k];if(!weight)continue;m.fromArray(h.mesh.skeleton.boneMatrices,a[j*4+k]*16);sum.addScaledVector(v.copy(base).applyMatrix4(m),weight);nsum.addScaledVector(n.copy(normal).transformDirection(m),weight);}
    sum.applyMatrix4(toLocal).toArray(positions,i*3);nsum.transformDirection(toLocal).toArray(normals,i*3);uv[i*2]=src.attributes.uv.getX(j);uv[i*2+1]=src.attributes.uv.getY(j);
   }
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));for(const g of cut.groups)geo.addGroup(g.start,g.count,g.materialIndex);geo.computeBoundingSphere();
   return geo;
  }
 };
})();
