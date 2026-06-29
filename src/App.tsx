import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// ─── FIREBASE FIRESTORE REST API ─────────────────────────────────────────────
// Usa la API REST de Firestore — compatible con cualquier entorno sin build step
const FB_PROJECT = "odontologia-werbag";
const FB_API_KEY = "AIzaSyAtj2Cz9otET54WtKoSQk5KPPcQ7DOKbVw";
const FB_BASE = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

// Convierte clave "prefix:id" en { col, docId }
const parseKey = k => {
  const parts = k.split(":");
  if(parts.length===2) return { col:parts[0], docId:parts[1] };
  if(parts.length===3) return { col:`${parts[0]}__${parts[1]}`, docId:parts[2] };
  return { col:"misc", docId:k.replace(/:/g,"__") };
};

// Convierte valor JS a campo Firestore
const toFB = v => {
  const s = JSON.stringify(v);
  return { stringValue: s };
};

// Extrae valor string de un campo Firestore
const fromFB = field => field?.stringValue ?? null;

// GET — devuelve null si no existe
const sGet = async k => {
  try {
    const {col,docId} = parseKey(k);
    const url = `${FB_BASE}/${col}/${docId}?key=${FB_API_KEY}`;
    const res = await fetch(url);
    if(!res.ok) return null;
    const data = await res.json();
    const val = fromFB(data?.fields?._v);
    if(val===null) return null;
    return { value: val };
  } catch(e){ console.error("sGet",k,e); return null; }
};

// SET — crea o sobreescribe
const sSet = async (k, v) => {
  try {
    const {col,docId} = parseKey(k);
    const url = `${FB_BASE}/${col}/${docId}?key=${FB_API_KEY}`;
    const body = {
      fields: {
        _v: toFB(v),
        _k: { stringValue: k },
        _ts: { integerValue: String(Date.now()) }
      }
    };
    const res = await fetch(url, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if(!res.ok) throw new Error(await res.text());
    return { key:k, value:JSON.stringify(v) };
  } catch(e){ console.error("sSet",k,e); return null; }
};

// LIST — lista todos los docs de una colección
const sList = async prefix => {
  try {
    const col = prefix.replace(/:$/,"").replace(/:/g,"__");
    const url = `${FB_BASE}/${col}?key=${FB_API_KEY}`;
    const res = await fetch(url);
    if(!res.ok) return { keys:[] };
    const data = await res.json();
    const docs = data?.documents || [];
    const keys = docs.map(d => {
      const kField = d?.fields?._k?.stringValue;
      if(kField) return kField;
      // Fallback: extraer id del nombre del doc
      const parts = d.name.split("/");
      return `${col}:${parts[parts.length-1]}`;
    });
    return { keys };
  } catch(e){ console.error("sList",prefix,e); return { keys:[] }; }
};

// DELETE
const sDel = async k => {
  try {
    const {col,docId} = parseKey(k);
    const url = `${FB_BASE}/${col}/${docId}?key=${FB_API_KEY}`;
    const res = await fetch(url, { method:"DELETE" });
    return { key:k, deleted:res.ok };
  } catch(e){ console.error("sDel",k,e); return null; }
};

// ─── TOOTH CONSTANTS ─────────────────────────────────────────────────────────
const UPPER_ADULT  = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER_ADULT  = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
// Primary (milk) teeth use letters: upper A-J left to right, lower K-T left to right
// FDI notation for primary: 55-51, 61-65 (upper) / 85-81, 71-75 (lower)
const UPPER_PRIMARY = [55,54,53,52,51,61,62,63,64,65];
const LOWER_PRIMARY = [85,84,83,82,81,71,72,73,74,75];
const SURFACES = ["vestibular","mesial","distal","palatino","oclusal"];

const CONDITIONS = {
  healthy:    { label:"Sano"           },
  done_surf:  { label:"Tratado (rojo)" },
  todo_surf:  { label:"A tratar (azul)"},
  leaking:    { label:"Filtrado"       },
  extraction: { label:"Extracción"     },
  missing:    { label:"Ausente"        },
};

const COMMON_PATHOLOGIES = ["Diabetes","Hipertensión","Cardiopatía","Asma","Epilepsia","HIV/SIDA","Hepatitis","Osteoporosis","Hipotiroidismo","Hipertiroidismo","Embarazo","Coagulopatía","Insuficiencia renal","Cáncer","Artritis reumatoide"];
const COMMON_MEDICATIONS  = ["Anticoagulantes","Antihipertensivos","Corticoides","Bifosfonatos","Antiepilépticos","Antidepresivos","Ansiolíticos","Insulina","Metformina","Aspirina","Ibuprofeno","Paracetamol","Antibióticos (en curso)"];
const COMMON_ALLERGIES    = ["Penicilina","Amoxicilina","Lidocaína","Látex","AINES","Aspirina","Cefalosporinas","Sulfas","Yodo","Anestesia local"];
const COMMON_TREATMENTS   = ["Obturación composite","Obturación amalgama","Endodoncia","Extracción simple","Extracción quirúrgica","Corona porcelana","Corona metal","Implante","Limpieza profunda","Pulpotomía","Sellador de fosas","Carilla","Blanqueamiento","Puente fijo","Prótesis removible"];

const emptyPatient = (professionalId="") => ({
  id: Date.now().toString(),
  professionalId,
  firstName:"",lastName:"",dni:"",cuit:"",birthDate:"",gender:"",
  phone:"",email:"",address:"",occupation:"",
  obraSocial:"",nroAfiliado:"",
  pathologies:[],medications:[],allergies:[],
  lastVisit:"",previousDentist:"",dentalNotes:"",
  teeth:{}, milkTeeth:{},
  evolution:[], images:[], budgets:[], payments:[],
  createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
});

// ─── STYLES ──────────────────────────────────────────────────────────────────
const ls = { display:"block",fontSize:11,fontWeight:700,color:"#374151",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5 };
const is = { width:"100%",padding:"9px 12px",borderRadius:8,border:"2px solid #e2e8f0",fontSize:13,color:"#1e293b",backgroundColor:"#fff",boxSizing:"border-box",outline:"none",fontFamily:"inherit" };
const gs = { display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(190px,1fr))",gap:12,marginBottom:12 };
const btnPrimary = { padding:"9px 18px",borderRadius:9,border:"none",background:"linear-gradient(135deg,#2563eb,#7c3aed)",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer" };
const btnSecondary = { padding:"9px 18px",borderRadius:9,border:"2px solid #e2e8f0",background:"#fff",color:"#64748b",fontWeight:600,fontSize:13,cursor:"pointer" };

function Field({label,value,onChange,placeholder,type="text",disabled=false}){
  return(<div><label style={ls}>{label}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{...is,backgroundColor:disabled?"#f8fafc":"#fff"}}
      onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/></div>);
}
function SectionTitle({icon,title}){
  return(<div style={{display:"flex",alignItems:"center",gap:8,margin:"24px 0 14px",paddingBottom:8,borderBottom:"2px solid #f1f5f9"}}>
    <span style={{fontSize:18}}>{icon}</span>
    <h3 style={{margin:0,fontSize:14,fontWeight:700,color:"#1e293b",textTransform:"uppercase",letterSpacing:0.5}}>{title}</h3>
  </div>);
}
function TagInput({label,value,onChange,suggestions=[],placeholder}){
  const [input,setInput]=useState(""); const [show,setShow]=useState(false);
  const add=item=>{const v=item.trim();if(v&&!value.includes(v))onChange([...value,v]);setInput("");setShow(false);};
  const rem=item=>onChange(value.filter(x=>x!==item));
  const filtered=suggestions.filter(s=>!value.includes(s)&&s.toLowerCase().includes(input.toLowerCase()));
  return(<div style={{marginBottom:16,position:"relative"}}><label style={ls}>{label}</label>
    <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:8,border:"2px solid #e2e8f0",borderRadius:10,backgroundColor:"#fff",minHeight:44}}>
      {value.map(v=>(<span key={v} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",backgroundColor:"#eff6ff",color:"#2563eb",borderRadius:20,fontSize:12,fontWeight:600}}>
        {v}<button onClick={()=>rem(v)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",padding:0,fontSize:14}}>×</button></span>))}
      <input value={input} onChange={e=>{setInput(e.target.value);setShow(true);}} onFocus={()=>setShow(true)}
        onKeyDown={e=>{if(e.key==="Enter"&&input){e.preventDefault();add(input);}}}
        placeholder={value.length===0?placeholder:"Agregar..."} style={{border:"none",outline:"none",fontSize:13,minWidth:120,flex:1,backgroundColor:"transparent"}}/>
    </div>
    {show&&filtered.length>0&&(<div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"2px solid #e2e8f0",borderRadius:10,zIndex:100,maxHeight:160,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",marginTop:4}}>
      {filtered.map(s=>(<div key={s} onMouseDown={()=>add(s)} style={{padding:"8px 14px",cursor:"pointer",fontSize:13,color:"#374151"}}
        onMouseEnter={e=>e.currentTarget.style.backgroundColor="#f0f9ff"} onMouseLeave={e=>e.currentTarget.style.backgroundColor="transparent"}>{s}</div>))}
    </div>)}
  </div>);
}

// ─── TOOTH SVG (used in odontogram grid) ─────────────────────────────────────
function ToothSVG({number,data={},onClick,size=56}){
  const S=size,C=S/2,pad=Math.round(S*0.1),inn=Math.round(S*0.22);
  const surf=data.surfaces||{};
  const condition=data.condition||"healthy";
  const zones={
    oclusal:   [[C-inn,C-inn],[C+inn,C-inn],[C+inn,C+inn],[C-inn,C+inn]],
    vestibular:[[pad,pad],[S-pad,pad],[C+inn,C-inn],[C-inn,C-inn]],
    palatino:  [[C-inn,C+inn],[C+inn,C+inn],[S-pad,S-pad],[pad,S-pad]],
    mesial:    [[pad,pad],[C-inn,C-inn],[C-inn,C+inn],[pad,S-pad]],
    distal:    [[C+inn,C-inn],[S-pad,pad],[S-pad,S-pad],[C+inn,C+inn]],
  };
  const pts=arr=>arr.map(p=>p.join(",")).join(" ");
  const gc=s=>{const v=surf[s];return v==="done"?"#ef4444":v==="todo"?"#2563eb":"white";};
  const go=s=>surf[s]?0.82:0;
  const isMissing=condition==="missing",isExt=condition==="extraction",isLeak=condition==="leaking";
  const lw=Math.max(2,S*0.045);
  return(
    <div onClick={()=>onClick(number)} style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",gap:2,userSelect:"none"}}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}
        style={{borderRadius:5,filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.13))",transition:"filter 0.13s,transform 0.13s"}}
        onMouseEnter={e=>{e.currentTarget.style.filter="drop-shadow(0 3px 8px rgba(37,99,235,0.4))";e.currentTarget.style.transform="scale(1.12)";}}
        onMouseLeave={e=>{e.currentTarget.style.filter="drop-shadow(0 1px 2px rgba(0,0,0,0.13))";e.currentTarget.style.transform="scale(1)";}}>
        <rect x={pad} y={pad} width={S-pad*2} height={S-pad*2} rx={3} fill="white" stroke="#cbd5e1" strokeWidth={1.5}/>
        {SURFACES.map(s=><polygon key={s} points={pts(zones[s])} fill={gc(s)} fillOpacity={go(s)} stroke="#e2e8f0" strokeWidth={0.5}/>)}
        <rect x={C-inn} y={C-inn} width={inn*2} height={inn*2} fill="none" stroke="#94a3b8" strokeWidth={0.8}/>
        <rect x={pad} y={pad} width={S-pad*2} height={S-pad*2} rx={3} fill="none" stroke="#94a3b8" strokeWidth={1.5}/>
        {isMissing&&<><line x1={pad+3} y1={pad+3} x2={S-pad-3} y2={S-pad-3} stroke="#ef4444" strokeWidth={lw} strokeLinecap="round"/>
          <line x1={S-pad-3} y1={pad+3} x2={pad+3} y2={S-pad-3} stroke="#ef4444" strokeWidth={lw} strokeLinecap="round"/></>}
        {isExt&&<><line x1={pad+3} y1={C-4} x2={S-pad-3} y2={C-4} stroke="#2563eb" strokeWidth={lw} strokeLinecap="round"/>
          <line x1={pad+3} y1={C+4} x2={S-pad-3} y2={C+4} stroke="#2563eb" strokeWidth={lw} strokeLinecap="round"/></>}
        {isLeak&&<><circle cx={C} cy={C} r={S*0.18} fill="none" stroke="#ef4444" strokeWidth={lw}/>
          <circle cx={C} cy={C} r={S*0.07} fill="#2563eb"/></>}
      </svg>
      <span style={{fontSize:Math.max(7,S*0.14),color:"#6b7280",fontWeight:700,letterSpacing:0.2}}>{number}</span>
    </div>
  );
}

// ─── TOOTH MODAL ─────────────────────────────────────────────────────────────
function ToothModal({number,data={},onSave,onClose}){
  const [condition,setCondition]=useState(data.condition||"healthy");
  const [surfaces,setSurfaces]=useState(data.surfaces||{});
  const [surfMode,setSurfMode]=useState("done");
  const [notes,setNotes]=useState(data.notes||"");
  const [treatment,setTreatment]=useState(data.treatment||"");
  const [date,setDate]=useState(data.date||"");
  const S=96,C=S/2,pad=9,inn=21;
  const zones={
    oclusal:[[C-inn,C-inn],[C+inn,C-inn],[C+inn,C+inn],[C-inn,C+inn]],
    vestibular:[[pad,pad],[S-pad,pad],[C+inn,C-inn],[C-inn,C-inn]],
    palatino:[[C-inn,C+inn],[C+inn,C+inn],[S-pad,S-pad],[pad,S-pad]],
    mesial:[[pad,pad],[C-inn,C-inn],[C-inn,C+inn],[pad,S-pad]],
    distal:[[C+inn,C-inn],[S-pad,pad],[S-pad,S-pad],[C+inn,C+inn]],
  };
  const pts=arr=>arr.map(p=>p.join(",")).join(" ");
  const gc=s=>{const v=surfaces[s];return v==="done"?"#ef4444":v==="todo"?"#2563eb":"white";};
  const go=s=>surfaces[s]?0.8:0;
  const toggleSurf=s=>setSurfaces(prev=>{const n={...prev};n[s]===surfMode?delete n[s]:n[s]=surfMode;return n;});
  const isMissing=condition==="missing",isExt=condition==="extraction",isLeak=condition==="leaking";
  const showSurf=!isMissing&&!isExt&&!isLeak;
  return(
    <div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{backgroundColor:"#fff",borderRadius:18,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:800,color:"#1e293b"}}>Diente #{number}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8"}}>✕</button>
        </div>
        <div style={{marginBottom:16}}>
          <label style={ls}>Condición</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {Object.entries(CONDITIONS).map(([k,v])=>(
              <button key={k} onClick={()=>setCondition(k)}
                style={{padding:"7px 4px",borderRadius:8,border:`2px solid ${condition===k?"#2563eb":"#e2e8f0"}`,backgroundColor:condition===k?"#eff6ff":"#fff",color:condition===k?"#2563eb":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                {v.label}</button>))}
          </div>
        </div>
        {showSurf&&(<div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <label style={ls}>Superficies</label>
            <button onClick={()=>setSurfaces({})} style={{fontSize:11,color:"#94a3b8",background:"none",border:"none",cursor:"pointer"}}>Limpiar</button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            <button onClick={()=>setSurfMode("done")} style={{flex:1,padding:"7px",borderRadius:8,border:`2px solid ${surfMode==="done"?"#ef4444":"#e2e8f0"}`,backgroundColor:surfMode==="done"?"#fef2f2":"#fff",color:surfMode==="done"?"#ef4444":"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>🔴 Tratado</button>
            <button onClick={()=>setSurfMode("todo")} style={{flex:1,padding:"7px",borderRadius:8,border:`2px solid ${surfMode==="todo"?"#2563eb":"#e2e8f0"}`,backgroundColor:surfMode==="todo"?"#eff6ff":"#fff",color:surfMode==="todo"?"#2563eb":"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>🔵 A tratar</button>
          </div>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8}}>
            <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{borderRadius:8,boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}>
              <rect x={pad} y={pad} width={S-pad*2} height={S-pad*2} rx={4} fill="white" stroke="#cbd5e1" strokeWidth={1.5}/>
              {SURFACES.map(s=><polygon key={s} points={pts(zones[s])} fill={gc(s)} fillOpacity={go(s)} stroke="#e2e8f0" strokeWidth={0.8} style={{cursor:"pointer"}} onClick={()=>toggleSurf(s)}/>)}
              <rect x={C-inn} y={C-inn} width={inn*2} height={inn*2} fill="none" stroke="#94a3b8" strokeWidth={1}/>
              <rect x={pad} y={pad} width={S-pad*2} height={S-pad*2} rx={4} fill="none" stroke="#94a3b8" strokeWidth={1.5}/>
              <text x={C} y={pad+9} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight="700">V</text>
              <text x={C} y={S-pad-3} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight="700">P/L</text>
              <text x={pad+7} y={C+3} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight="700">M</text>
              <text x={S-pad-7} y={C+3} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight="700">D</text>
              <text x={C} y={C+3} textAnchor="middle" fontSize={8} fill="#64748b" fontWeight="700">O</text>
            </svg>
          </div>
          <p style={{margin:0,fontSize:11,color:"#94a3b8",textAlign:"center"}}>Tocá cada cara para marcarla</p>
        </div>)}
        {(isMissing||isExt||isLeak)&&(
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
            <svg width={70} height={70} viewBox="0 0 60 60" style={{borderRadius:8,boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}>
              <rect x={5} y={5} width={50} height={50} rx={4} fill="white" stroke="#94a3b8" strokeWidth={1.5}/>
              {isMissing&&<><line x1={9} y1={9} x2={51} y2={51} stroke="#ef4444" strokeWidth={3.5} strokeLinecap="round"/><line x1={51} y1={9} x2={9} y2={51} stroke="#ef4444" strokeWidth={3.5} strokeLinecap="round"/></>}
              {isExt&&<><line x1={9} y1={24} x2={51} y2={24} stroke="#2563eb" strokeWidth={3} strokeLinecap="round"/><line x1={9} y1={36} x2={51} y2={36} stroke="#2563eb" strokeWidth={3} strokeLinecap="round"/></>}
              {isLeak&&<><circle cx={30} cy={30} r={13} fill="none" stroke="#ef4444" strokeWidth={3}/><circle cx={30} cy={30} r={4.5} fill="#2563eb"/></>}
            </svg>
          </div>
        )}
        <div style={{marginBottom:10}}><label style={ls}>Tratamiento indicado</label>
          <input value={treatment} onChange={e=>setTreatment(e.target.value)} placeholder="Ej: Obturación composite clase II" style={is}/></div>
        <div style={{marginBottom:10}}><label style={ls}>Fecha</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={is}/></div>
        <div style={{marginBottom:20}}><label style={ls}>Notas clínicas</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observaciones..." rows={3} style={{...is,resize:"vertical",fontFamily:"inherit"}}/></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={()=>onSave(number,{condition,surfaces,notes,treatment,date})} style={{...btnPrimary,flex:1}}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── ODONTOGRAM PANEL ─────────────────────────────────────────────────────────
function OdontogramPanel({teeth,milkTeeth,onTeethChange,onMilkChange}){
  const [sel,setSel]=useState(null);
  const [isMilk,setIsMilk]=useState(false);
  const [selTooth,setSelTooth]=useState(null);

  const handleClick=(n,milk)=>{setSel(n);setIsMilk(milk);setSelTooth(milk?milkTeeth[n]||{}:teeth[n]||{});};
  const handleSave=(n,data)=>{
    if(isMilk) onMilkChange({...milkTeeth,[n]:data});
    else onTeethChange({...teeth,[n]:data});
    setSel(null);
  };

  const Legend=()=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:14,padding:"9px 12px",backgroundColor:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
      {[{l:"Sano",el:<rect width={13} height={13} rx={2} fill="white" stroke="#94a3b8" strokeWidth={1.5}/>},
        {l:"Tratado",el:<rect width={13} height={13} rx={2} fill="#ef4444" fillOpacity={0.8}/>},
        {l:"A tratar",el:<rect width={13} height={13} rx={2} fill="#2563eb" fillOpacity={0.8}/>},
        {l:"Filtrado",el:<><circle cx={6.5} cy={6.5} r={5.5} fill="none" stroke="#ef4444" strokeWidth={2}/><circle cx={6.5} cy={6.5} r={2.2} fill="#2563eb"/></>},
        {l:"Extracción",el:<><line x1={1} y1={5} x2={12} y2={5} stroke="#2563eb" strokeWidth={2} strokeLinecap="round"/><line x1={1} y1={8.5} x2={12} y2={8.5} stroke="#2563eb" strokeWidth={2} strokeLinecap="round"/></>},
        {l:"Ausente",el:<><line x1={1} y1={1} x2={12} y2={12} stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round"/><line x1={12} y1={1} x2={1} y2={12} stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round"/></>},
      ].map(({l,el})=>(
        <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#374151",fontWeight:600}}>
          <svg width={13} height={13} viewBox="0 0 13 13">{el}</svg>{l}
        </span>
      ))}
    </div>
  );

  const TeethRow=({numbers,milk})=>(
    <div style={{display:"flex",gap:2,justifyContent:"center",flexWrap:"nowrap"}}>
      {numbers.map(n=><ToothSVG key={n} number={n} data={milk?milkTeeth[n]||{}:teeth[n]||{}} onClick={()=>handleClick(n,milk)} size={milk?44:52}/>)}
    </div>
  );

  return(
    <div>
      {sel&&<ToothModal number={sel} data={selTooth} onSave={handleSave} onClose={()=>setSel(null)}/>}
      <Legend/>

      {/* Toggle */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={()=>setIsMilk(false)} style={{...isMilk?btnSecondary:btnPrimary,flex:1,padding:"8px"}}>🦷 Dentición Permanente</button>
        <button onClick={()=>setIsMilk(true)} style={{...isMilk?btnPrimary:btnSecondary,flex:1,padding:"8px"}}>🌱 Dentición Primaria (Leche)</button>
      </div>

      <div style={{backgroundColor:"#f8fafc",borderRadius:14,padding:"14px 10px",border:"1px solid #e2e8f0",overflowX:"auto"}}>
        <div style={{minWidth:isMilk?380:540}}>
          {!isMilk&&(<>
            <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
              <div style={{width:70,fontSize:10,fontWeight:700,color:"#94a3b8",textAlign:"right",paddingRight:8}}>Superior</div>
              <div style={{flex:1}}><TeethRow numbers={UPPER_ADULT} milk={false}/></div>
            </div>
            <div style={{display:"flex",alignItems:"center",margin:"8px 0"}}>
              <div style={{width:70}}/><div style={{flex:1,borderTop:"2px dashed #cbd5e1"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",marginTop:4}}>
              <div style={{width:70,fontSize:10,fontWeight:700,color:"#94a3b8",textAlign:"right",paddingRight:8}}>Inferior</div>
              <div style={{flex:1}}><TeethRow numbers={LOWER_ADULT} milk={false}/></div>
            </div>
          </>)}
          {isMilk&&(<>
            <div style={{textAlign:"center",marginBottom:6}}>
              <span style={{fontSize:12,fontWeight:700,color:"#7c3aed",backgroundColor:"#f5f3ff",padding:"4px 12px",borderRadius:20}}>Nomenclatura FDI — Dientes de Leche</span>
            </div>
            <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
              <div style={{width:60,fontSize:10,fontWeight:700,color:"#94a3b8",textAlign:"right",paddingRight:8}}>Superior</div>
              <div style={{flex:1}}><TeethRow numbers={UPPER_PRIMARY} milk={true}/></div>
            </div>
            <div style={{display:"flex",alignItems:"center",margin:"8px 0"}}>
              <div style={{width:60}}/><div style={{flex:1,borderTop:"2px dashed #a855f7",opacity:0.5}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",marginTop:4}}>
              <div style={{width:60,fontSize:10,fontWeight:700,color:"#94a3b8",textAlign:"right",paddingRight:8}}>Inferior</div>
              <div style={{flex:1}}><TeethRow numbers={LOWER_PRIMARY} milk={true}/></div>
            </div>
            <div style={{marginTop:10,padding:"8px 12px",backgroundColor:"#f5f3ff",borderRadius:8,fontSize:11,color:"#7c3aed"}}>
              <b>Nomenclatura FDI:</b> Superior derecho 55→51 · Superior izquierdo 61→65 · Inferior izquierdo 71→75 · Inferior derecho 85→81
            </div>
          </>)}
          <div style={{display:"flex",justifyContent:"space-around",marginTop:8,paddingLeft:isMilk?60:70}}>
            <span style={{fontSize:10,color:"#94a3b8",fontWeight:700}}>← Derecha del paciente</span>
            <span style={{fontSize:10,color:"#94a3b8",fontWeight:700}}>Izquierda del paciente →</span>
          </div>
        </div>
      </div>
      <div style={{marginTop:10,padding:"9px 13px",backgroundColor:"#eff6ff",borderRadius:10,fontSize:12,color:"#3b82f6",fontWeight:600}}>
        💡 Tocá cualquier diente para editar sus superficies, condición y tratamiento
      </div>
    </div>
  );
}

// ─── EVOLUTION / CLINICAL HISTORY ─────────────────────────────────────────────
const emptyEntry=()=>({date:new Date().toISOString().slice(0,10),note:"",treatment:"",tooth:"",professional:""});

function EvolutionPanel({patient,onChange}){
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [entry,setEntry]=useState(emptyEntry());
  const entries=patient.evolution||[];

  const openNew=()=>{setEntry(emptyEntry());setEditingId(null);setShowForm(true);};
  const openEdit=e=>{setEntry({date:e.date,note:e.note,treatment:e.treatment||"",tooth:e.tooth||"",professional:e.professional||""});setEditingId(e.id);setShowForm(true);};
  const cancelForm=()=>{setShowForm(false);setEditingId(null);setEntry(emptyEntry());};

  const save=()=>{
    if(!entry.note.trim()) return;
    if(editingId){
      onChange({...patient,evolution:entries.map(e=>e.id===editingId?{...e,...entry}:e),updatedAt:new Date().toISOString()});
    } else {
      const newEntry={...entry,id:Date.now().toString(),createdAt:new Date().toISOString()};
      onChange({...patient,evolution:[newEntry,...entries],updatedAt:new Date().toISOString()});
    }
    cancelForm();
  };
  const [confirmEvo,setConfirmEvo]=useState(null);
  const del=id=>setConfirmEvo({msg:"¿Eliminar esta entrada del historial?",onOk:()=>{
    setConfirmEvo(null);
    onChange({...patient,evolution:entries.filter(e=>e.id!==id),updatedAt:new Date().toISOString()});
  }});

  return(
    <div>
      {confirmEvo&&<ConfirmModal msg={confirmEvo.msg} onOk={confirmEvo.onOk} onCancel={()=>setConfirmEvo(null)}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:"#1e293b"}}>📝 Historial de Evolución</h3>
        {!showForm&&<button onClick={openNew} style={btnPrimary}>+ Nueva entrada</button>}
      </div>

      {showForm&&(
        <div style={{backgroundColor:"#f8fafc",borderRadius:12,padding:16,marginBottom:20,border:`1px solid ${editingId?"#f59e0b":"#e2e8f0"}`}}>
          {editingId&&<div style={{fontSize:11,fontWeight:700,color:"#d97706",marginBottom:12}}>
            ✏️ Editando entrada — los cambios se guardan al hacer clic en "Actualizar"
          </div>}
          <div style={{...gs,marginBottom:10}}>
            <Field label="Fecha" value={entry.date} onChange={v=>setEntry(e=>({...e,date:v}))} type="date"/>
            <Field label="Diente(s)" value={entry.tooth} onChange={v=>setEntry(e=>({...e,tooth:v}))} placeholder="Ej: 16, 26"/>
            <Field label="Profesional" value={entry.professional} onChange={v=>setEntry(e=>({...e,professional:v}))} placeholder="Nombre del profesional"/>
            <Field label="Tratamiento realizado" value={entry.treatment} onChange={v=>setEntry(e=>({...e,treatment:v}))} placeholder="Ej: Obturación composite"/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={ls}>Nota clínica</label>
            <textarea value={entry.note} onChange={e=>setEntry(en=>({...en,note:e.target.value}))} placeholder="Descripción de la consulta, hallazgos, indicaciones..." rows={4}
              style={{...is,resize:"vertical",fontFamily:"inherit"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={cancelForm} style={btnSecondary}>Cancelar</button>
            <button onClick={save} style={{...btnPrimary,flex:1,background:editingId?"linear-gradient(135deg,#d97706,#b45309)":undefined}}>
              {editingId?"✏️ Actualizar entrada":"Guardar entrada"}
            </button>
          </div>
        </div>
      )}

      {entries.length===0?(
        <div style={{padding:32,textAlign:"center",color:"#94a3b8",backgroundColor:"#f8fafc",borderRadius:12,border:"1px dashed #e2e8f0"}}>
          <div style={{fontSize:32,marginBottom:8}}>📋</div>
          <div style={{fontWeight:600}}>Sin entradas aún</div>
          <div style={{fontSize:12,marginTop:4}}>Registrá cada consulta del paciente</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {entries.map(e=>(
            <div key={e.id} style={{backgroundColor:"#fff",borderRadius:12,padding:16,border:`1px solid ${editingId===e.id?"#f59e0b":"#e2e8f0"}`,borderLeft:`4px solid ${editingId===e.id?"#f59e0b":"#2563eb"}`,transition:"border-color 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <span style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{e.date}</span>
                  {e.tooth&&<span style={{marginLeft:10,backgroundColor:"#eff6ff",color:"#2563eb",padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700}}>🦷 {e.tooth}</span>}
                  {e.professional&&<span style={{marginLeft:8,color:"#64748b",fontSize:12}}>· {e.professional}</span>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>editingId===e.id?cancelForm():openEdit(e)}
                    title="Editar entrada"
                    style={{background:"none",border:"1px solid #e2e8f0",borderRadius:6,cursor:"pointer",color:editingId===e.id?"#f59e0b":"#94a3b8",fontSize:13,padding:"3px 8px"}}>
                    {editingId===e.id?"✕":"✏️"}
                  </button>
                  <button onClick={()=>del(e.id)} title="Eliminar" style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16,padding:"3px 4px"}}>🗑</button>
                </div>
              </div>
              {e.treatment&&<div style={{fontSize:12,fontWeight:700,color:"#7c3aed",marginBottom:6}}>Tratamiento: {e.treatment}</div>}
              <div style={{fontSize:13,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{e.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── IMAGES / RX PANEL ────────────────────────────────────────────────────────
function ImagesPanel({patient,onChange}){
  const [preview,setPreview]=useState(null);
  const fileRef=useRef();
  const images=patient.images||[];

  const saveImmediate=async(updatedPatient)=>{
    await sSet(`patient:${updatedPatient.id}`,updatedPatient);
  };

  const handleFile=async e=>{
    const files=Array.from(e.target.files);
    const newImgs=[];
    await Promise.all(files.map(file=>new Promise(res=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        newImgs.push({id:Date.now().toString()+Math.random(),name:file.name,type:file.type,data:ev.target.result,date:new Date().toISOString().slice(0,10),label:"",notes:""});
        res();
      };
      reader.readAsDataURL(file);
    })));
    const updated={...patient,images:[...newImgs,...images],updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveImmediate(updated);
    e.target.value="";
  };

  const updateImg=(id,field,val)=>{
    const updated={...patient,images:images.map(i=>i.id===id?{...i,[field]:val}:i),updatedAt:new Date().toISOString()};
    onChange(updated);
    saveImmediate(updated);
  };
  const [confirmImg,setConfirmImg]=useState(null);
  const delImg=id=>setConfirmImg({msg:"¿Eliminar esta imagen?",onOk:async()=>{
    setConfirmImg(null);
    const updated={...patient,images:images.filter(i=>i.id!==id),updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveImmediate(updated);
  }});

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:"#1e293b"}}>🩻 Radiografías e Imágenes</h3>
        <button onClick={()=>fileRef.current.click()} style={btnPrimary}>+ Subir imagen/RX</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFile}/>

      {preview&&(
        <div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.85)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setPreview(null)}>
          <div style={{maxWidth:"90vw",maxHeight:"90vh",position:"relative"}}>
            <img src={preview.data} alt={preview.name} style={{maxWidth:"100%",maxHeight:"85vh",borderRadius:8,objectFit:"contain"}}/>
            <div style={{position:"absolute",bottom:-32,left:0,right:0,textAlign:"center",color:"#fff",fontSize:13}}>{preview.label||preview.name}</div>
            <button onClick={()=>setPreview(null)} style={{position:"absolute",top:-16,right:-16,width:32,height:32,borderRadius:"50%",background:"#fff",border:"none",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>
      )}

      {images.length===0?(
        <div onClick={()=>fileRef.current.click()} style={{padding:40,textAlign:"center",color:"#94a3b8",backgroundColor:"#f8fafc",borderRadius:12,border:"2px dashed #e2e8f0",cursor:"pointer"}}>
          <div style={{fontSize:36,marginBottom:8}}>🩻</div>
          <div style={{fontWeight:600}}>Subí radiografías e imágenes</div>
          <div style={{fontSize:12,marginTop:4}}>Hacé clic o arrastrá archivos aquí</div>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
          {images.map(img=>(
            <div key={img.id} style={{backgroundColor:"#fff",borderRadius:10,overflow:"hidden",border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
              <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setPreview(img)}>
                <img src={img.data} alt={img.name} style={{width:"100%",height:110,objectFit:"cover",display:"block"}}/>
                <div style={{position:"absolute",inset:0,backgroundColor:"rgba(0,0,0,0)",transition:"background 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.backgroundColor="rgba(0,0,0,0.2)"}
                  onMouseLeave={e=>e.currentTarget.style.backgroundColor="rgba(0,0,0,0)"}/>
                <div style={{position:"absolute",top:4,right:4}}>
                  <button onClick={e=>{e.stopPropagation();delImg(img.id);}} style={{width:22,height:22,borderRadius:"50%",background:"rgba(0,0,0,0.5)",border:"none",color:"#fff",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              </div>
              <div style={{padding:8}}>
      {confirmImg&&<ConfirmModal msg={confirmImg.msg} onOk={confirmImg.onOk} onCancel={()=>setConfirmImg(null)}/>}
                <input value={img.label} onChange={e=>updateImg(img.id,"label",e.target.value)} placeholder="Etiqueta (ej: RX periapical 16)" style={{...is,padding:"5px 8px",fontSize:11,marginBottom:4}}/>
                <div style={{fontSize:10,color:"#94a3b8"}}>{img.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── HELPER: generar schedule de cobros desde un presupuesto ────────────────
// Modos: "contado" | "anticipo_cuotas"
// anticipo_cuotas: anticipo (mín 50%) + N cuotas mensuales sobre el saldo
function generarCuotas(budget, total){
  const pmt = budget.payment || {mode:"contado"};
  const schedule = [];
  const baseDate = budget.date || new Date().toISOString().slice(0,10);

  const addMeses = (dateStr, n) => {
    const d = new Date(dateStr + "T12:00:00");
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0,10);
  };

  if(pmt.mode === "contado"){
    schedule.push({tipo:"contado", label:"Pago total", monto:total, vencimiento:baseDate, nro:1, totalCuotas:1});
  } else {
    // anticipo_cuotas
    const anticipoAmt = parseFloat(pmt.anticipoAmt) || Math.round(total*(parseFloat(pmt.anticipoPct)||50)/100);
    const saldo = Math.max(0, total - anticipoAmt);
    const cuotas = Math.max(1, parseInt(pmt.cuotas)||1);
    const interesPct = parseFloat(pmt.interesPct)||0;
    const saldoConInt = saldo*(1+interesPct/100);
    const cuotaValor = roundTo(saldoConInt/cuotas, parseFloat(pmt.roundTo)||0);
    const totalCuotas = cuotas + 1; // anticipo + N cuotas

    schedule.push({tipo:"anticipo", label:"Anticipo", monto:anticipoAmt, vencimiento:baseDate, nro:1, totalCuotas});
    for(let i=0;i<cuotas;i++){
      schedule.push({
        tipo:"cuota", label:`Cuota ${i+1}/${cuotas}`,
        monto:cuotaValor, vencimiento:addMeses(baseDate, i+1),
        nro:i+2, totalCuotas
      });
    }
  }
  return schedule;
}

// ─── BUDGET PANEL ─────────────────────────────────────────────────────────────
const fmtARS=n=>n.toLocaleString("es-AR",{minimumFractionDigits:0,maximumFractionDigits:0});
const roundTo=( n,r)=>r>0?Math.round(n/r)*r:Math.round(n);

function PaymentBlock({total,payment,onChange}){
  // Dos modos: "contado" | "anticipo_cuotas"
  const defaultPmt={mode:"contado",anticipoPct:50,anticipoAmt:Math.round(total*0.5),cuotas:3,interesPct:0,roundTo:0};
  const p={...defaultPmt,...(payment||{})};

  const anticipoAmt = parseFloat(p.anticipoAmt)||Math.round(total*(parseFloat(p.anticipoPct)||50)/100);
  const saldo       = Math.max(0, total - anticipoAmt);
  const cuotas      = Math.max(1, parseInt(p.cuotas)||1);
  const interesPct  = parseFloat(p.interesPct)||0;
  const saldoConInt = saldo*(1+interesPct/100);
  const cuotaValor  = roundTo(saldoConInt/cuotas, parseFloat(p.roundTo)||0);

  const modoBtn=(mode,label,icon)=>(
    <button onClick={()=>onChange({...p,mode})}
      style={{flex:1,padding:"10px 8px",borderRadius:10,
        border:`2px solid ${p.mode===mode?"#2563eb":"#e2e8f0"}`,
        backgroundColor:p.mode===mode?"#eff6ff":"#fff",
        color:p.mode===mode?"#2563eb":"#64748b",
        fontWeight:700,fontSize:12,cursor:"pointer",
        display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
      <span style={{fontSize:18}}>{icon}</span>{label}
    </button>
  );

  return(
    <div style={{marginTop:14,padding:14,backgroundColor:"#f0f9ff",borderRadius:10,border:"1px solid #bae6fd"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0369a1",marginBottom:10,textTransform:"uppercase",letterSpacing:0.4}}>
        💳 Plan de pago
      </div>

      {/* Selector de modo */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {modoBtn("contado","Contado","💵")}
        {modoBtn("anticipo_cuotas","Anticipo + cuotas","📅")}
      </div>

      {/* ── CONTADO ── */}
      {p.mode==="contado"&&(
        <div style={{padding:"12px 16px",backgroundColor:"#fff",borderRadius:8,border:"1px solid #e2e8f0",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#374151",fontWeight:600}}>Total al contado</span>
          <span style={{fontSize:20,fontWeight:800,color:"#2563eb"}}>${fmtARS(total)}</span>
        </div>
      )}

      {/* ── ANTICIPO + CUOTAS MENSUALES ── */}
      {p.mode==="anticipo_cuotas"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>

          {/* Anticipo */}
          <div style={{backgroundColor:"#fff",borderRadius:8,border:"1px solid #e2e8f0",padding:"12px 14px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",marginBottom:8}}>Anticipo <span style={{color:"#94a3b8",fontWeight:400,textTransform:"none"}}>(mínimo 50%)</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <label style={ls}>Porcentaje %</label>
                <input type="number" value={p.anticipoPct} min={50} max={100}
                  onChange={e=>{
                    const pct=Math.max(50,Math.min(100,parseFloat(e.target.value)||50));
                    onChange({...p,anticipoPct:pct,anticipoAmt:Math.round(total*pct/100)});
                  }}
                  style={{...is,padding:"8px 10px"}}/>
              </div>
              <div>
                <label style={ls}>Monto $</label>
                <input type="number" value={anticipoAmt} min={Math.round(total*0.5)}
                  onChange={e=>{
                    const amt=Math.max(Math.round(total*0.5),parseFloat(e.target.value)||0);
                    onChange({...p,anticipoAmt:amt,anticipoPct:total>0?Math.round(amt/total*100):50});
                  }}
                  style={{...is,padding:"8px 10px"}}/>
              </div>
            </div>
          </div>

          {/* Cuotas */}
          <div style={{backgroundColor:"#fff",borderRadius:8,border:"1px solid #e2e8f0",padding:"12px 14px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",marginBottom:8}}>Cuotas mensuales sobre el saldo</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <div>
                <label style={ls}>Cantidad</label>
                <input type="number" value={p.cuotas} min={1} max={60}
                  onChange={e=>onChange({...p,cuotas:Math.max(1,parseInt(e.target.value)||1)})}
                  style={{...is,padding:"8px 10px"}}/>
              </div>
              <div>
                <label style={ls}>Interés % /cuota</label>
                <input type="number" value={p.interesPct} min={0} step={0.5}
                  onChange={e=>onChange({...p,interesPct:parseFloat(e.target.value)||0})}
                  style={{...is,padding:"8px 10px"}}/>
              </div>
              <div>
                <label style={ls}>Redondeo $</label>
                <input type="number" value={p.roundTo||0} min={0} step={100}
                  onChange={e=>onChange({...p,roundTo:parseFloat(e.target.value)||0})}
                  style={{...is,padding:"8px 10px"}}/>
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div style={{backgroundColor:"#1e293b",borderRadius:10,padding:"14px 16px",color:"#fff"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",marginBottom:10}}>Resumen del plan</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase"}}>Anticipo ({p.anticipoPct}%)</div>
                <div style={{fontSize:17,fontWeight:800,color:"#60a5fa"}}>${fmtARS(anticipoAmt)}</div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase"}}>Saldo a financiar</div>
                <div style={{fontSize:17,fontWeight:800,color:"#f8fafc"}}>${fmtARS(saldo)}</div>
              </div>
            </div>
            <div style={{borderTop:"1px solid #334155",paddingTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase"}}>{cuotas} cuota{cuotas>1?"s":""} mensual{cuotas>1?"es":""} de</div>
                <div style={{fontSize:17,fontWeight:800,color:"#34d399"}}>${fmtARS(cuotaValor)}</div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase"}}>Total del plan</div>
                <div style={{fontSize:17,fontWeight:800,color:"#f8fafc"}}>${fmtARS(anticipoAmt+cuotaValor*cuotas)}</div>
              </div>
            </div>
            {interesPct>0&&(
              <div style={{marginTop:8,fontSize:11,color:"#fbbf24",borderTop:"1px solid #334155",paddingTop:8}}>
                Recargo por interés: ${fmtARS(saldoConInt-saldo)} ({interesPct}% × {cuotas} cuota{cuotas>1?"s":""})
              </div>
            )}
          </div>

          <div style={{fontSize:11,color:"#0369a1",fontWeight:600,textAlign:"center"}}>
            📋 Al aprobar se generan {cuotas+1} cobros en la solapa Pagos: 1 anticipo + {cuotas} cuota{cuotas>1?"s":""} mensuales
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetPanel({patient,onChange,currentProf}){
  const [showForm,setShowForm]=useState(false);
  const [editingBudgetId,setEditingBudgetId]=useState(null);
  const emptyDraft=()=>({title:"",date:new Date().toISOString().slice(0,10),items:[],notes:"",showPrices:true,status:"pendiente",payment:{mode:"contado",anticipoPct:50,anticipoAmt:0,cuotas:3,interesPct:0,roundTo:0}});
  const [draft,setDraft]=useState(emptyDraft());
  const [newItem,setNewItem]=useState({description:"",tooth:"",quantity:1,price:""});
  const budgets=patient.budgets||[];

  const openEdit=b=>{
    setDraft({
      title:b.title||"",
      date:b.date||new Date().toISOString().slice(0,10),
      items:[...(b.items||[])],
      notes:b.notes||"",
      showPrices:b.showPrices!==false,
      status:b.status||"pendiente",
      payment:{...{mode:"contado",anticipoPct:50,anticipoAmt:0,cuotas:3,interesPct:0,roundTo:0},...(b.payment||{})}
    });
    setEditingBudgetId(b.id);
    setShowForm(true);
  };

  const addItem=()=>{
    if(!newItem.description.trim()) return;
    const item={...newItem,id:Date.now().toString()};
    const newItems=[...draft.items,item];
    const newTotal=newItems.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0);
    setDraft(d=>({...d,items:newItems,payment:{...d.payment,anticipoAmt:Math.round(newTotal*(d.payment.anticipoPct||50)/100)}}));
    setNewItem({description:"",tooth:"",quantity:1,price:""});
  };
  const removeItem=id=>{
    const newItems=draft.items.filter(i=>i.id!==id);
    const newTotal=newItems.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0);
    setDraft(d=>({...d,items:newItems,payment:{...d.payment,anticipoAmt:Math.round(newTotal*(d.payment.anticipoPct||50)/100)}}));
  };
  const total=draft.items.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0);

  const saveNow=async(patientData)=>{await sSet(`patient:${patientData.id}`,patientData);};

  const exportBudgetPDF=async(b,tot)=>{
    const pmt=b.payment||{mode:"contado"};
    const ant=parseFloat(pmt.anticipoAmt)||Math.round(tot*(parseFloat(pmt.anticipoPct)||50)/100);
    const sal=Math.max(0,tot-ant);
    const nq=Math.max(1,parseInt(pmt.cuotas)||1);
    const intPct=parseFloat(pmt.interesPct)||0;
    const cv=roundTo(sal*(1+intPct/100)/nq,parseFloat(pmt.roundTo)||0);
    const totalPlan=pmt.mode==="anticipo_cuotas"?ant+cv*nq:tot;
    const drTitle=(currentProf?.gender==="dra")?"Dra.":"Dr.";
    const profName=currentProf?.name||"Profesional";
    const patName=`${patient.firstName||""} ${patient.lastName||""}`.trim()||"Paciente";
    const today=new Date().toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit",year:"numeric"});

    const itemsRows=(b.items||[]).map((item,i)=>`
      <tr style="background:${i%2?"#f9fafb":"#fff"}">
        <td style="padding:8px 12px;color:#1e293b;">${item.description}</td>
        <td style="padding:8px 12px;text-align:center;color:#64748b;">${item.tooth||"—"}</td>
        <td style="padding:8px 12px;text-align:center;color:#64748b;">${item.quantity}</td>
        ${b.showPrices?`<td style="padding:8px 12px;text-align:right;color:#64748b;">$${fmtARS(parseFloat(item.price)||0)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;">$${fmtARS((parseFloat(item.price)||0)*(parseInt(item.quantity)||1))}</td>`:""}
      </tr>`).join("");

    const pagoSection=pmt.mode==="contado"?`
      <div style="background:#eff6ff;border-radius:10px;padding:16px;margin-top:16px;border:1px solid #bfdbfe;">
        <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px;">💵 FORMA DE PAGO: CONTADO</div>
        <div style="font-size:22px;font-weight:800;color:#1d4ed8;">$${fmtARS(tot)}</div>
      </div>
    `:`
      <div style="background:#1e293b;border-radius:10px;padding:16px;margin-top:16px;color:#fff;">
        <div style="font-size:13px;font-weight:700;color:#94a3b8;margin-bottom:12px;">📅 PLAN DE PAGO: ANTICIPO + ${nq} CUOTA${nq>1?"S":""} MENSUAL${nq>1?"ES":""}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
          <div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Anticipo (${pmt.anticipoPct}%)</div>
            <div style="font-size:20px;font-weight:800;color:#60a5fa;">$${fmtARS(ant)}</div></div>
          <div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Cuota mensual × ${nq}</div>
            <div style="font-size:20px;font-weight:800;color:#34d399;">$${fmtARS(cv)}</div></div>
          <div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Total del plan</div>
            <div style="font-size:20px;font-weight:800;color:#f8fafc;">$${fmtARS(totalPlan)}</div></div>
        </div>
        ${intPct>0?`<div style="font-size:11px;color:#fbbf24;border-top:1px solid #334155;padding-top:8px;">
          Interés: ${intPct}% por cuota sobre saldo financiado ($${fmtARS(sal)})
        </div>`:""}
      </div>
    `;

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
    <title>Presupuesto — ${patName}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;padding:32px;}
      @media print{body{padding:16px;}@page{margin:1.5cm;}}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th{background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:700;color:#374151;border-bottom:2px solid #e2e8f0;}
      tfoot td{border-top:2px solid #e2e8f0;font-weight:800;font-size:15px;}
    </style></head><body>

    <!-- HEADER -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #e2e8f0;">
      <div style="display:flex;align-items:center;gap:16px;">
        <img src="${LOGO_B64}" style="width:72px;height:72px;border-radius:12px;object-fit:cover;"/>
        <div>
          <div style="font-size:22px;font-weight:800;color:#1e293b;">Odontología Werbag</div>
          <div style="font-size:13px;color:#64748b;margin-top:2px;">${drTitle} ${profName}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:22px;font-weight:800;color:#2563eb;">PRESUPUESTO</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Fecha: ${today}</div>
        <div style="font-size:12px;color:#64748b;">Válido por 30 días</div>
      </div>
    </div>

    <!-- DATOS PACIENTE + TÍTULO -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div style="background:#f8fafc;border-radius:10px;padding:14px;border:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px;">Paciente</div>
        <div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px;">${patName}</div>
        ${patient.dni?`<div style="font-size:12px;color:#64748b;">DNI: ${patient.dni}</div>`:""}
        ${patient.phone?`<div style="font-size:12px;color:#64748b;">Tel: ${patient.phone}</div>`:""}
        ${patient.obraSocial?`<div style="font-size:12px;color:#64748b;">OS: ${patient.obraSocial}</div>`:""}
      </div>
      <div style="background:#eff6ff;border-radius:10px;padding:14px;border:1px solid #bfdbfe;">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px;">Plan de tratamiento</div>
        <div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px;">${b.title}</div>
        <div style="font-size:12px;color:#64748b;">Fecha: ${b.date}</div>
      </div>
    </div>

    <!-- TABLA DE TRATAMIENTOS -->
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:0;">
      <table>
        <thead><tr>
          <th>Tratamiento</th>
          <th style="text-align:center;">Diente</th>
          <th style="text-align:center;">Cant.</th>
          ${b.showPrices?"<th style='text-align:right;'>Precio unit.</th><th style='text-align:right;'>Subtotal</th>":""}
        </tr></thead>
        <tbody>${itemsRows}</tbody>
        ${b.showPrices?`<tfoot><tr>
          <td colspan="${b.showPrices?3:3}" style="padding:10px 12px;text-align:right;color:#374151;">TOTAL</td>
          <td></td>
          <td style="padding:10px 12px;text-align:right;color:#2563eb;">$${fmtARS(tot)}</td>
        </tr></tfoot>`:""}
      </table>
    </div>

    <!-- FORMA DE PAGO -->
    ${pagoSection}

    <!-- NOTAS -->
    ${b.notes?`<div style="margin-top:16px;padding:12px 16px;background:#fef9c3;border-radius:8px;border:1px solid #fde68a;font-size:12px;color:#854d0e;">
      <strong>Notas:</strong> ${b.notes}
    </div>`:""}

    <!-- PIE -->
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:11px;color:#94a3b8;">Odontología Werbag · Presupuesto generado el ${today}</div>
      <div style="font-size:11px;color:#94a3b8;">Válido por 30 días corridos desde la fecha</div>
    </div>

    <script>window.onload=()=>{setTimeout(()=>window.print(),400);}</script>
    </body></html>`;

    const win=window.open("","_blank","width=900,height=700");
    if(win){
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(()=>win.print(),800);
    } else {
      const blob=new Blob([html],{type:"text/html;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`presupuesto-${(patient.lastName||"paciente").toLowerCase()}.html`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    }
  };

  const save=async()=>{
    if(!draft.title.trim()||draft.items.length===0) return;
    let newBudgets;
    if(editingBudgetId){
      newBudgets=budgets.map(b=>b.id===editingBudgetId?{...b,...draft}:b);
    } else {
      const b={...draft,id:Date.now().toString(),createdAt:new Date().toISOString()};
      newBudgets=[b,...budgets];
    }
    const updated={...patient,budgets:newBudgets,updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveNow(updated);
    setDraft(emptyDraft());
    setEditingBudgetId(null);
    setShowForm(false);
  };
  const [confirmBudget,setConfirmBudget]=useState(null);
  const delBudget=id=>setConfirmBudget({msg:"¿Eliminar este presupuesto? También se eliminarán los cobros pendientes asociados.",onOk:async()=>{
    setConfirmBudget(null);
    // Eliminar cuotas pendientes asociadas a este presupuesto
    const newPayments=(patient.payments||[]).filter(p=>!(p.budgetId===id&&p.tipo==="pendiente"&&!p.pagado));
    const updated={...patient,budgets:budgets.filter(b=>b.id!==id),payments:newPayments,updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveNow(updated);
  }});
  const updateStatus=async(id,status)=>{
    const b=budgets.find(b=>b.id===id);
    let newPayments=[...(patient.payments||[])];

    // Si se aprueba: generar cuotas pendientes (solo si no existen ya)
    if(status==="aprobado"&&b&&b.showPrices&&b.items?.length>0){
      const yaGenerado=newPayments.some(p=>p.budgetId===id&&p.tipo==="pendiente");
      if(!yaGenerado){
        const tot=b.items?.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0)||0;
        const schedule=generarCuotas(b,tot);
        schedule.forEach((cuota,idx)=>{
          newPayments.push({
            id:`${id}-cuota-${idx}-${Date.now()}`,
            budgetId:id,
            tipo:"pendiente",
            label:cuota.label,
            amount:cuota.monto,
            vencimiento:cuota.vencimiento,
            date:"",
            method:"",
            concept:cuota.label,
            nro:cuota.nro,
            totalCuotas:cuota.totalCuotas,
            pagado:false,
            createdAt:new Date().toISOString(),
          });
        });
      }
    }

    // Si se rechaza: eliminar cuotas pendientes no pagadas de ese presupuesto
    if(status==="rechazado"){
      newPayments=newPayments.filter(p=>!(p.budgetId===id&&p.tipo==="pendiente"&&!p.pagado));
    }

    const updated={...patient,budgets:budgets.map(b=>b.id===id?{...b,status}:b),payments:newPayments,updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveNow(updated);
  };

  const statusColors={pendiente:"#f59e0b",aprobado:"#22c55e",rechazado:"#ef4444",en_curso:"#3b82f6",finalizado:"#8b5cf6"};
  const statusLabels={pendiente:"Pendiente",aprobado:"Aprobado",rechazado:"Rechazado",en_curso:"En curso",finalizado:"Finalizado"};

  return(
    <div>
      {confirmBudget&&<ConfirmModal msg={confirmBudget.msg} onOk={confirmBudget.onOk} onCancel={()=>setConfirmBudget(null)}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:"#1e293b"}}>💰 Presupuestos y Planes</h3>
        {!showForm&&<button onClick={()=>{setDraft(emptyDraft());setShowForm(true);}} style={btnPrimary}>+ Nuevo presupuesto</button>}
      </div>

      {showForm&&(
        <div style={{backgroundColor:"#f8fafc",borderRadius:12,padding:16,marginBottom:20,border:"1px solid #e2e8f0"}}>
          {editingBudgetId&&<div style={{fontSize:11,fontWeight:700,color:"#d97706",marginBottom:12,padding:"6px 10px",backgroundColor:"#fef9c3",borderRadius:8,border:"1px solid #fde68a"}}>
          ✏️ Editando presupuesto — los cambios reemplazarán el presupuesto original
        </div>}
        <div style={{...gs,marginBottom:12}}>
            <Field label="Título del plan" value={draft.title} onChange={v=>setDraft(d=>({...d,title:v}))} placeholder="Ej: Plan de tratamiento completo"/>
            <Field label="Fecha" value={draft.date} onChange={v=>setDraft(d=>({...d,date:v}))} type="date"/>
            <div>
              <label style={ls}>Incluir precios</label>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>setDraft(d=>({...d,showPrices:true}))} style={{...draft.showPrices?btnPrimary:btnSecondary,padding:"8px 14px",flex:1,fontSize:12}}>Con precios</button>
                <button onClick={()=>setDraft(d=>({...d,showPrices:false}))} style={{...!draft.showPrices?btnPrimary:btnSecondary,padding:"8px 14px",flex:1,fontSize:12}}>Sin precios</button>
              </div>
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={ls}>Tratamientos / Ítems</label>
            <div style={{display:"grid",gridTemplateColumns:"2fr 0.7fr 0.5fr"+(draft.showPrices?" 0.8fr":"")+" auto",gap:6,marginBottom:8,alignItems:"end"}}>
              <div><input value={newItem.description} onChange={e=>setNewItem(i=>({...i,description:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&addItem()}
                placeholder="Tratamiento..." style={{...is,padding:"7px 10px"}}/></div>
              <div><input value={newItem.tooth} onChange={e=>setNewItem(i=>({...i,tooth:e.target.value}))} placeholder="Diente" style={{...is,padding:"7px 10px"}}/></div>
              <div><input type="number" value={newItem.quantity} onChange={e=>setNewItem(i=>({...i,quantity:e.target.value}))} placeholder="Cant." min={1} style={{...is,padding:"7px 10px"}}/></div>
              {draft.showPrices&&<div><input type="number" value={newItem.price} onChange={e=>setNewItem(i=>({...i,price:e.target.value}))} placeholder="Precio $" style={{...is,padding:"7px 10px"}}/></div>}
              <button onClick={addItem} style={{...btnPrimary,padding:"7px 12px",whiteSpace:"nowrap"}}>+</button>
            </div>

            {draft.items.length>0&&(
              <div style={{border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{backgroundColor:"#f1f5f9"}}>
                    <th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:"#374151"}}>Tratamiento</th>
                    <th style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:"#374151"}}>Diente</th>
                    <th style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:"#374151"}}>Cant.</th>
                    {draft.showPrices&&<><th style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:"#374151"}}>Precio</th>
                    <th style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:"#374151"}}>Subtotal</th></>}
                    <th style={{padding:"7px 4px"}}></th>
                  </tr></thead>
                  <tbody>{draft.items.map((item,idx)=>(
                    <tr key={item.id} style={{borderTop:"1px solid #f1f5f9",backgroundColor:idx%2?"#fafafa":"#fff"}}>
                      <td style={{padding:"7px 10px",color:"#1e293b"}}>{item.description}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:"#64748b"}}>{item.tooth||"—"}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:"#64748b"}}>{item.quantity}</td>
                      {draft.showPrices&&<><td style={{padding:"7px 10px",textAlign:"right",color:"#64748b"}}>{item.price?`$${fmtARS(parseFloat(item.price))}`:"—"}</td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,color:"#1e293b"}}>{item.price?`$${fmtARS((parseFloat(item.price)||0)*(parseInt(item.quantity)||1))}`:"—"}</td></>}
                      <td style={{padding:"7px 4px"}}><button onClick={()=>removeItem(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:14}}>✕</button></td>
                    </tr>
                  ))}</tbody>
                  {draft.showPrices&&<tfoot><tr style={{borderTop:"2px solid #e2e8f0",backgroundColor:"#f8fafc"}}>
                    <td colSpan={4} style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#1e293b"}}>TOTAL</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:"#2563eb",fontSize:14}}>${fmtARS(total)}</td>
                    <td/>
                  </tr></tfoot>}
                </table>
              </div>
            )}
          </div>

          {draft.showPrices&&draft.items.length>0&&(
            <PaymentBlock total={total} payment={draft.payment}
              onChange={pmt=>setDraft(d=>({...d,payment:pmt}))}/>
          )}

          <div style={{marginBottom:12,marginTop:14}}><label style={ls}>Notas / Condiciones</label>
            <textarea value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}
              placeholder="Condiciones, descuentos, notas para el paciente..." rows={2}
              style={{...is,resize:"vertical",fontFamily:"inherit"}}/></div>

          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>{setShowForm(false);setDraft(emptyDraft());setEditingBudgetId(null);}} style={btnSecondary}>Cancelar</button>
            {draft.title&&draft.items.length>0&&draft.showPrices&&(
              <button onClick={()=>{
                const tot=draft.items.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0);
                exportBudgetPDF({...draft,id:"preview",createdAt:new Date().toISOString()},tot);
              }}
                style={{padding:"10px 16px",borderRadius:10,border:"2px solid #25d366",backgroundColor:"#f0fdf4",
                  color:"#166534",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:16}}>📄</span> Vista previa PDF
              </button>
            )}
            <button onClick={save} style={{...btnPrimary,flex:1,background:editingBudgetId?"linear-gradient(135deg,#d97706,#b45309)":undefined}} disabled={!draft.title||draft.items.length===0}>
              {editingBudgetId?"✏️ Actualizar presupuesto":"💾 Guardar presupuesto"}
            </button>
          </div>
        </div>
      )}

      {budgets.length===0&&!showForm&&(
        <div style={{padding:32,textAlign:"center",color:"#94a3b8",backgroundColor:"#f8fafc",borderRadius:12,border:"1px dashed #e2e8f0"}}>
          <div style={{fontSize:32,marginBottom:8}}>💰</div>
          <div style={{fontWeight:600}}>Sin presupuestos aún</div>
          <div style={{fontSize:12,marginTop:4}}>Creá el primer presupuesto para este paciente</div>
        </div>
      )}
      {budgets.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {budgets.map(b=>{
            const tot=b.items?.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0)||0;
            const pmt=b.payment||{mode:"contado"};
            return(
              <div key={b.id} style={{backgroundColor:"#fff",borderRadius:12,padding:16,border:"1px solid #e2e8f0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <img src={LOGO_B64} alt="Logo" style={{width:36,height:36,borderRadius:8,objectFit:"cover",flexShrink:0}}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{b.title}</div>
                      <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{b.date}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <select value={b.status} onChange={e=>updateStatus(b.id,e.target.value)}
                      style={{...is,width:"auto",padding:"4px 8px",fontSize:11,color:statusColors[b.status]||"#64748b",fontWeight:700,borderColor:statusColors[b.status]||"#e2e8f0"}}>
                      {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                    {b.showPrices&&<button onClick={()=>exportBudgetPDF(b,tot)}
                      title="Exportar PDF para WhatsApp"
                      style={{padding:"4px 8px",borderRadius:6,border:"1px solid #25d366",backgroundColor:"#f0fdf4",
                        color:"#166534",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                      📄 PDF
                    </button>}
                    <button onClick={()=>openEdit(b)}
                      title="Editar presupuesto"
                      style={{padding:"4px 8px",borderRadius:6,border:"1px solid #f59e0b",backgroundColor:"#fffbeb",
                        color:"#d97706",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                      ✏️
                    </button>
                    <button onClick={()=>delBudget(b.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16}}>🗑</button>
                  </div>
                </div>
                {b.items&&b.items.length>0&&(
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:8}}>
                  <thead><tr style={{backgroundColor:"#f8fafc"}}>
                    <th style={{padding:"5px 8px",textAlign:"left",fontWeight:700,color:"#374151"}}>Tratamiento</th>
                    <th style={{padding:"5px 8px",textAlign:"center",fontWeight:700,color:"#374151"}}>Diente</th>
                    <th style={{padding:"5px 8px",textAlign:"center",fontWeight:700,color:"#374151"}}>Cant.</th>
                    {b.showPrices&&<><th style={{padding:"5px 8px",textAlign:"right",fontWeight:700}}>Precio</th><th style={{padding:"5px 8px",textAlign:"right",fontWeight:700}}>Subtotal</th></>}
                  </tr></thead>
                  <tbody>{b.items.map((item,idx)=>(
                    <tr key={item.id} style={{borderTop:"1px solid #f1f5f9",backgroundColor:idx%2?"#fafafa":"#fff"}}>
                      <td style={{padding:"5px 8px",color:"#1e293b"}}>{item.description}</td>
                      <td style={{padding:"5px 8px",textAlign:"center",color:"#64748b"}}>{item.tooth||"—"}</td>
                      <td style={{padding:"5px 8px",textAlign:"center",color:"#64748b"}}>{item.quantity}</td>
                      {b.showPrices&&<><td style={{padding:"5px 8px",textAlign:"right",color:"#64748b"}}>{item.price?`$${fmtARS(parseFloat(item.price))}`:"—"}</td>
                      <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600}}>{item.price?`$${fmtARS((parseFloat(item.price)||0)*(parseInt(item.quantity)||1))}`:"—"}</td></>}
                    </tr>
                  ))}</tbody>
                  {b.showPrices&&<tfoot><tr style={{borderTop:"2px solid #e2e8f0"}}>
                    <td colSpan={4} style={{padding:"6px 8px",textAlign:"right",fontWeight:700}}>TOTAL</td>
                    <td style={{padding:"6px 8px",textAlign:"right",fontWeight:800,color:"#2563eb"}}>${fmtARS(tot)}</td>
                  </tr></tfoot>}
                </table>
                )}
                {b.showPrices&&pmt.mode&&pmt.mode!=="contado"&&(()=>{
                  const ant=parseFloat(pmt.anticipoAmt)||Math.round(tot*(parseFloat(pmt.anticipoPct)||50)/100);
                  const sal=Math.max(0,tot-ant);
                  const nq=Math.max(1,parseInt(pmt.cuotas)||1);
                  const cv=roundTo(sal*(1+(parseFloat(pmt.interesPct)||0)/100)/nq,parseFloat(pmt.roundTo)||0);
                  return(
                    <div style={{padding:"10px 14px",backgroundColor:"#1e293b",borderRadius:8,color:"#fff",marginBottom:6,fontSize:12}}>
                      <div style={{fontWeight:700,color:"#94a3b8",marginBottom:6}}>📅 Plan: Anticipo + {nq} cuota{nq>1?"s":""} mensual{nq>1?"es":""}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                        <div><div style={{fontSize:10,color:"#64748b"}}>ANTICIPO ({pmt.anticipoPct}%)</div>
                          <div style={{fontWeight:800,color:"#60a5fa"}}>${fmtARS(ant)}</div></div>
                        <div><div style={{fontSize:10,color:"#64748b"}}>CUOTA</div>
                          <div style={{fontWeight:800,color:"#34d399"}}>${fmtARS(cv)}</div></div>
                        <div><div style={{fontSize:10,color:"#64748b"}}>TOTAL PLAN</div>
                          <div style={{fontWeight:800,color:"#f8fafc"}}>${fmtARS(ant+cv*nq)}</div></div>
                      </div>
                    </div>
                  );
                })()}
                {b.notes&&<div style={{fontSize:12,color:"#64748b",marginTop:4,padding:"6px 8px",backgroundColor:"#f8fafc",borderRadius:6}}>{b.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PAYMENTS / DEUDA PANEL ──────────────────────────────────────────────────
function PaymentsPanel({patient,onChange}){
  const allPayments=patient.payments||[];
  const pagosReales=allPayments.filter(p=>p.tipo!=="pendiente"&&p.amount>0);
  const cuotasPendientes=allPayments.filter(p=>p.tipo==="pendiente"&&!p.pagado);
  const cuotasPagadas=allPayments.filter(p=>p.tipo==="pendiente"&&p.pagado);
  const budgets=(patient.budgets||[]).filter(b=>b.showPrices&&b.items?.length>0);

  const emptyPago=()=>({date:new Date().toISOString().slice(0,10),amount:"",method:"efectivo",budgetId:"",concept:"",note:""});
  const [showForm,setShowForm]=useState(false);
  const [pago,setPago]=useState(emptyPago());

  const saveNow=async(updated)=>{await sSet(`patient:${updated.id}`,updated);};

  // Totales
  const totalPresupuestado=budgets.filter(b=>b.status==="aprobado").reduce((s,b)=>s+b.items.reduce((ss,i)=>ss+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0),0);
  const totalPagadoReal=pagosReales.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const totalPagadoCuotas=cuotasPagadas.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const totalPagado=totalPagadoReal+totalPagadoCuotas;
  const deudaTotal=Math.max(0,totalPresupuestado-totalPagado);

  // Cobrar cuota pendiente
  const cobrarCuota=async(cuota)=>{
    const updated={...patient,
      payments:allPayments.map(p=>p.id===cuota.id?{...p,pagado:true,date:new Date().toISOString().slice(0,10),method:"efectivo"}:p),
      updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveNow(updated);
  };

  const editarMetodoCuota=async(cuotaId,method)=>{
    const updated={...patient,
      payments:allPayments.map(p=>p.id===cuotaId?{...p,method}:p),
      updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveNow(updated);
  };

  const savePago=async()=>{
    if(!pago.amount||parseFloat(pago.amount)<=0) return;
    const newPago={...pago,id:Date.now().toString(),amount:parseFloat(pago.amount),tipo:"manual",createdAt:new Date().toISOString()};
    const updated={...patient,payments:[newPago,...allPayments],updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveNow(updated);
    setPago(emptyPago());
    setShowForm(false);
  };

  const [confirmPago,setConfirmPago]=useState(null);
  const delPago=id=>setConfirmPago({msg:"¿Eliminar este pago del historial?",onOk:async()=>{
    setConfirmPago(null);
    const updated={...patient,payments:allPayments.filter(p=>p.id!==id),updatedAt:new Date().toISOString()};
    onChange(updated);
    await saveNow(updated);
  }});

  const today=new Date().toISOString().slice(0,10);
  const isVencida=p=>p.vencimiento&&p.vencimiento<today;
  const methodIcon=m=>m==="efectivo"?"💵":"🏦";

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:"#1e293b"}}>💳 Pagos y Cobros</h3>
        {!showForm&&<button onClick={()=>{setPago(emptyPago());setShowForm(true);}} style={btnPrimary}>+ Pago manual</button>}
      </div>

      {confirmPago&&<ConfirmModal msg={confirmPago.msg} onOk={confirmPago.onOk} onCancel={()=>setConfirmPago(null)}/>}
      {/* Resumen financiero */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Presupuestado",value:totalPresupuestado,color:"#2563eb",bg:"#eff6ff"},
          {label:"Cobrado",value:totalPagado,color:"#22c55e",bg:"#f0fdf4"},
          {label:"Saldo pendiente",value:deudaTotal,color:deudaTotal>0?"#ef4444":"#22c55e",bg:deudaTotal>0?"#fef2f2":"#f0fdf4"},
        ].map(({label,value,color,bg})=>(
          <div key={label} style={{backgroundColor:bg,borderRadius:12,padding:"12px 14px",border:`1px solid ${color}22`}}>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>{label}</div>
            <div style={{fontSize:18,fontWeight:800,color}}>${fmtARS(value)}</div>
          </div>
        ))}
      </div>

      {/* Cuotas pendientes de cobro */}
      {cuotasPendientes.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8,textTransform:"uppercase",letterSpacing:0.4,display:"flex",alignItems:"center",gap:6}}>
            ⏳ Cobros pendientes
            <span style={{backgroundColor:"#fef2f2",color:"#ef4444",padding:"2px 8px",borderRadius:10,fontSize:11}}>{cuotasPendientes.length}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {cuotasPendientes.sort((a,b)=>(a.vencimiento||"").localeCompare(b.vencimiento||"")).map(cuota=>{
              const venc=isVencida(cuota);
              const budgetName=budgets.find(b=>b.id===cuota.budgetId)?.title||"";
              return(
                <div key={cuota.id} style={{backgroundColor:venc?"#fef2f2":"#fff",borderRadius:10,padding:"12px 14px",
                  border:`1px solid ${venc?"#fecaca":"#e2e8f0"}`,borderLeft:`4px solid ${venc?"#ef4444":"#f59e0b"}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#1e293b",display:"flex",alignItems:"center",gap:6}}>
                        {cuota.label}
                        {venc&&<span style={{fontSize:10,backgroundColor:"#fee2e2",color:"#dc2626",padding:"2px 6px",borderRadius:6,fontWeight:700}}>VENCIDA</span>}
                      </div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                        {budgetName&&<span style={{color:"#7c3aed"}}>📄 {budgetName} · </span>}
                        Vence: {cuota.vencimiento||"—"}
                      </div>
                    </div>
                    <div style={{fontWeight:800,fontSize:16,color:venc?"#ef4444":"#1e293b",flexShrink:0}}>
                      ${fmtARS(cuota.amount)}
                    </div>
                    {/* Selector método */}
                    <select value={cuota.method||"efectivo"} onChange={e=>editarMetodoCuota(cuota.id,e.target.value)}
                      style={{...is,width:"auto",padding:"5px 8px",fontSize:11,flexShrink:0}}>
                      <option value="efectivo">💵 Efectivo</option>
                      <option value="transferencia">🏦 Transferencia</option>
                    </select>
                    <button onClick={()=>cobrarCuota(cuota)}
                      style={{...btnPrimary,padding:"7px 12px",fontSize:12,flexShrink:0,whiteSpace:"nowrap"}}>
                      ✓ Cobrar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulario pago manual */}
      {showForm&&(
        <div style={{backgroundColor:"#f8fafc",borderRadius:12,padding:16,marginBottom:16,border:"1px solid #e2e8f0"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:12,textTransform:"uppercase",letterSpacing:0.4}}>Pago manual</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><label style={ls}>Fecha</label>
              <input type="date" value={pago.date} onChange={e=>setPago(p=>({...p,date:e.target.value}))} style={is}/></div>
            <div><label style={ls}>Monto $</label>
              <input type="number" value={pago.amount} onChange={e=>setPago(p=>({...p,amount:e.target.value}))}
                placeholder="0" min={0} style={{...is,borderColor:!pago.amount?"#fca5a5":undefined}}/></div>
          </div>
          <div style={{marginBottom:10}}>
            <label style={ls}>Medio de pago</label>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              {[{k:"efectivo",l:"💵 Efectivo"},{k:"transferencia",l:"🏦 Transferencia"}].map(({k,l})=>(
                <button key={k} onClick={()=>setPago(p=>({...p,method:k}))}
                  style={{flex:1,padding:"9px",borderRadius:9,border:`2px solid ${pago.method===k?"#2563eb":"#e2e8f0"}`,
                    backgroundColor:pago.method===k?"#eff6ff":"#fff",color:pago.method===k?"#2563eb":"#64748b",
                    fontWeight:700,fontSize:13,cursor:"pointer"}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <label style={ls}>Asociar a presupuesto (opcional)</label>
            <select value={pago.budgetId} onChange={e=>setPago(p=>({...p,budgetId:e.target.value}))}
              style={{...is,padding:"9px 12px"}}>
              <option value="">— Pago general —</option>
              {budgets.map(b=>{
                const tot=b.items.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0);
                return <option key={b.id} value={b.id}>{b.title} (${fmtARS(tot)})</option>;
              })}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <label style={ls}>Concepto</label>
            <input value={pago.concept} onChange={e=>setPago(p=>({...p,concept:e.target.value}))}
              placeholder="Ej: Seña, pago total, etc." style={is}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setShowForm(false);setPago(emptyPago());}} style={btnSecondary}>Cancelar</button>
            <button onClick={savePago} disabled={!pago.amount||parseFloat(pago.amount)<=0}
              style={{...btnPrimary,flex:1,opacity:!pago.amount||parseFloat(pago.amount)<=0?0.6:1}}>
              💾 Registrar pago
            </button>
          </div>
        </div>
      )}

      {/* Historial completo */}
      {(pagosReales.length>0||cuotasPagadas.length>0)&&(
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8,textTransform:"uppercase",letterSpacing:0.4}}>
            ✅ Historial cobrado
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {[...cuotasPagadas,...pagosReales].sort((a,b)=>(b.date||b.createdAt||"").localeCompare(a.date||a.createdAt||"")).map(p=>{
              const budgetName=budgets.find(b=>b.id===p.budgetId)?.title||null;
              return(
                <div key={p.id} style={{backgroundColor:"#fff",borderRadius:10,padding:"11px 14px",
                  border:"1px solid #e2e8f0",borderLeft:"4px solid #22c55e",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{fontSize:20,flexShrink:0}}>{p.method?methodIcon(p.method):"✅"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontWeight:800,fontSize:14,color:"#22c55e"}}>${fmtARS(p.amount)}</span>
                      {p.method&&<span style={{fontSize:11,backgroundColor:p.method==="efectivo"?"#f0fdf4":"#eff6ff",
                        color:p.method==="efectivo"?"#166534":"#1d4ed8",
                        padding:"2px 8px",borderRadius:10,fontWeight:700}}>
                        {p.method==="efectivo"?"Efectivo":"Transferencia"}
                      </span>}
                      {budgetName&&<span style={{fontSize:11,backgroundColor:"#f5f3ff",color:"#7c3aed",padding:"2px 8px",borderRadius:10,fontWeight:600}}>📄 {budgetName}</span>}
                    </div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                      {p.date||"Sin fecha"}
                      {p.concept&&<span style={{marginLeft:8}}>· {p.concept}</span>}
                      {p.label&&<span style={{marginLeft:8}}>· {p.label}</span>}
                    </div>
                  </div>
                  {p.tipo!=="pendiente"&&<button onClick={()=>delPago(p.id)} title="Eliminar"
                    style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16,flexShrink:0}}>🗑</button>}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:10,padding:"10px 14px",backgroundColor:"#f8fafc",borderRadius:10,
            border:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:12,color:"#64748b"}}>
              {pagosReales.filter(p=>p.method==="efectivo").length+cuotasPagadas.filter(p=>p.method==="efectivo").length} efectivo ·{" "}
              {pagosReales.filter(p=>p.method==="transferencia").length+cuotasPagadas.filter(p=>p.method==="transferencia").length} transferencia
            </div>
            <div style={{fontWeight:800,fontSize:14,color:deudaTotal>0?"#ef4444":"#22c55e"}}>
              {deudaTotal>0?`Debe: $${fmtARS(deudaTotal)}`:"✓ Sin deuda"}
            </div>
          </div>
        </div>
      )}

      {allPayments.length===0&&cuotasPendientes.length===0&&!showForm&&(
        <div style={{padding:32,textAlign:"center",color:"#94a3b8",backgroundColor:"#f8fafc",borderRadius:12,border:"1px dashed #e2e8f0"}}>
          <div style={{fontSize:32,marginBottom:8}}>💳</div>
          <div style={{fontWeight:600}}>Sin movimientos</div>
          <div style={{fontSize:12,marginTop:4}}>Aprobá un presupuesto para generar los cobros automáticamente</div>
        </div>
      )}
    </div>
  );
}

// ─── AGENDA / CALENDAR PANEL ─────────────────────────────────────────────────
function AgendaPanel({patient,onChange,currentProf,allPatients,onSelectPatient}){
  const today=new Date().toISOString().slice(0,10);
  const [viewDate,setViewDate]=useState(today.slice(0,7)); // "YYYY-MM"
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({date:today,time:"09:00",duration:30,notes:"",patientId:patient?.id||""});
  const [appointments,setAppointments]=useState([]);
  const [loadingAppts,setLoadingAppts]=useState(true);

  // Cargar turnos del profesional desde storage
  useEffect(()=>{
    (async()=>{
      setLoadingAppts(true);
      try{
        const r=await sGet(`agenda:${currentProf.id}`);
        if(r?.value) setAppointments(JSON.parse(r.value));
        else setAppointments([]);
      }catch{setAppointments([]);}
      finally{setLoadingAppts(false);}
    })();
  },[currentProf.id]);

  const saveAppts=async(list)=>{
    setAppointments(list);
    await sSet(`agenda:${currentProf.id}`,list);
  };

  const addAppt=async()=>{
    if(!form.date||!form.patientId) return;
    const newAppt={id:Date.now().toString(),patientId:form.patientId,date:form.date,
      time:form.time,duration:parseInt(form.duration)||30,notes:form.notes,
      createdAt:new Date().toISOString()};
    const updated=[...appointments,newAppt].sort((a,b)=>
      (a.date+a.time).localeCompare(b.date+b.time));
    await saveAppts(updated);
    setShowForm(false);
    setForm({date:today,time:"09:00",duration:30,notes:"",patientId:patient?.id||""});
  };

  const delAppt=async id=>{
    await saveAppts(appointments.filter(a=>a.id!==id));
  };

  // Calendario
  const [year,month]=viewDate.split("-").map(Number);
  const firstDay=new Date(year,month-1,1).getDay();
  const daysInMonth=new Date(year,month,0).getDate();
  const prevMonth=()=>{const d=new Date(year,month-2,1);setViewDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);};
  const nextMonth=()=>{const d=new Date(year,month,1);setViewDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);};
  const monthNames=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const dayNames=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

  const getPatientName=id=>{
    const p=(allPatients||[]).find(x=>x.id===id);
    return p?`${p.lastName||""}, ${p.firstName||""}`.trim()||"Sin nombre":"Paciente";
  };

  const apptsByDay={};
  appointments.forEach(a=>{
    if(!apptsByDay[a.date]) apptsByDay[a.date]=[];
    apptsByDay[a.date].push(a);
  });

  const [selectedDay,setSelectedDay]=useState(today);
  const dayAppts=(apptsByDay[selectedDay]||[]).sort((a,b)=>a.time.localeCompare(b.time));

  // Fuente de pacientes para el selector
  const patientPool=allPatients||[];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:"#1e293b"}}>📅 Agenda</h3>
        <button onClick={()=>{setForm({date:selectedDay,time:"09:00",duration:30,notes:"",patientId:patient?.id||""});setShowForm(true);}}
          style={btnPrimary}>+ Nuevo turno</button>
      </div>

      {/* Formulario nuevo turno */}
      {showForm&&(
        <div style={{backgroundColor:"#f8fafc",borderRadius:12,padding:16,marginBottom:16,border:"1px solid #e2e8f0"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:12,textTransform:"uppercase",letterSpacing:0.4}}>Nuevo turno</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><label style={ls}>Fecha</label>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={is}/></div>
            <div><label style={ls}>Hora</label>
              <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} style={is}/></div>
            <div><label style={ls}>Duración (min)</label>
              <select value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} style={{...is,padding:"9px 12px"}}>
                {[15,20,30,45,60,90,120].map(d=><option key={d} value={d}>{d} min</option>)}
              </select></div>
            <div><label style={ls}>Paciente</label>
              <select value={form.patientId} onChange={e=>setForm(f=>({...f,patientId:e.target.value}))}
                style={{...is,padding:"9px 12px",borderColor:!form.patientId?"#fca5a5":undefined}}>
                <option value="">— Seleccionar paciente —</option>
                {patientPool.map(p=><option key={p.id} value={p.id}>{(p.lastName||"")}, {(p.firstName||"")} {p.dni?`· DNI ${p.dni}`:""}</option>)}
              </select></div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={ls}>Notas del turno</label>
            <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
              placeholder="Ej: Control, extracción, urgencia..." style={is}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowForm(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={addAppt} disabled={!form.date||!form.patientId}
              style={{...btnPrimary,flex:1,opacity:!form.date||!form.patientId?0.6:1}}>
              💾 Guardar turno
            </button>
          </div>
        </div>
      )}

      {/* Calendario */}
      <div style={{backgroundColor:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:12}}>
        {/* Header mes */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",
          backgroundColor:"#1e293b",color:"#fff"}}>
          <button onClick={prevMonth} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:18,padding:"0 4px"}}>‹</button>
          <span style={{fontWeight:700,fontSize:14}}>{monthNames[month-1]} {year}</span>
          <button onClick={nextMonth} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:18,padding:"0 4px"}}>›</button>
        </div>
        {/* Días de semana */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",backgroundColor:"#f1f5f9"}}>
          {dayNames.map(d=><div key={d} style={{padding:"6px 0",textAlign:"center",fontSize:10,fontWeight:700,color:"#64748b"}}>{d}</div>)}
        </div>
        {/* Días del mes */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth}).map((_,i)=>{
            const day=i+1;
            const dateStr=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const hasAppts=apptsByDay[dateStr]?.length>0;
            const isToday=dateStr===today;
            const isSelected=dateStr===selectedDay;
            return(
              <div key={day} onClick={()=>setSelectedDay(dateStr)}
                style={{padding:"6px 0",textAlign:"center",cursor:"pointer",position:"relative",
                  backgroundColor:isSelected?"#2563eb":isToday?"#eff6ff":"transparent",
                  borderRadius:isSelected||isToday?"50%":"0",margin:"1px auto",width:32,height:32,
                  display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                <span style={{fontSize:12,fontWeight:isToday||isSelected?700:400,
                  color:isSelected?"#fff":isToday?"#2563eb":"#1e293b"}}>{day}</span>
                {hasAppts&&<div style={{width:4,height:4,borderRadius:"50%",
                  backgroundColor:isSelected?"#fff":"#2563eb",marginTop:1}}/>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Turnos del día seleccionado */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8,textTransform:"uppercase",letterSpacing:0.4}}>
          {selectedDay===today?"Hoy":"Turnos del"} {selectedDay===today?"":selectedDay}
          {dayAppts.length>0&&<span style={{marginLeft:6,backgroundColor:"#eff6ff",color:"#2563eb",
            padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,textTransform:"none"}}>{dayAppts.length} turno{dayAppts.length>1?"s":""}</span>}
        </div>
        {loadingAppts&&<div style={{textAlign:"center",color:"#94a3b8",padding:16}}>Cargando...</div>}
        {!loadingAppts&&dayAppts.length===0&&(
          <div style={{padding:20,textAlign:"center",color:"#94a3b8",backgroundColor:"#f8fafc",
            borderRadius:10,border:"1px dashed #e2e8f0",fontSize:13}}>
            Sin turnos para este día
          </div>
        )}
        {dayAppts.map(a=>(
          <div key={a.id} style={{backgroundColor:"#fff",borderRadius:10,padding:"12px 14px",
            marginBottom:8,border:"1px solid #e2e8f0",borderLeft:"4px solid #2563eb",
            display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"center",flexShrink:0,backgroundColor:"#eff6ff",
              borderRadius:8,padding:"6px 10px",minWidth:48}}>
              <div style={{fontSize:14,fontWeight:800,color:"#2563eb"}}>{a.time}</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>{a.duration}min</div>
            </div>
            <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onSelectPatient&&onSelectPatient(a.patientId)}>
              <div style={{fontWeight:700,fontSize:13,color:"#1e293b",overflow:"hidden",
                textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{getPatientName(a.patientId)}</div>
              {a.notes&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{a.notes}</div>}
            </div>
            <button onClick={()=>delAppt(a.id)} style={{background:"none",border:"none",
              cursor:"pointer",color:"#94a3b8",fontSize:16,flexShrink:0}}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Alias para que la tab "turnos" siga funcionando
function AppointmentsPanel({patient,onChange,currentProf,allPatients,onSelectPatient}){
  return <AgendaPanel patient={patient} onChange={onChange} currentProf={currentProf} allPatients={allPatients} onSelectPatient={onSelectPatient}/>;
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
function exportPDF(patient){
  const fullName=`${patient.lastName||""}, ${patient.firstName||""}`.trim().replace(/^,\s*/,"");
  const today=new Date().toLocaleDateString("es-AR");
  const teethEntries=Object.entries(patient.teeth||{}).filter(([,d])=>d.condition&&d.condition!=="healthy");
  const milkEntries=Object.entries(patient.milkTeeth||{}).filter(([,d])=>d.condition&&d.condition!=="healthy");

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Odontología Werbag — ${fullName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:24px;}
    h1{font-size:20px;color:#2563eb;margin-bottom:4px;}
    .subtitle{color:#64748b;font-size:11px;margin-bottom:20px;}
    h2{font-size:13px;font-weight:700;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin:18px 0 10px;text-transform:uppercase;letter-spacing:0.5px;}
    .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;}
    .field{padding:7px 10px;background:#f8fafc;border-radius:6px;}
    .field-label{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:2px;}
    .field-value{font-size:12px;font-weight:600;color:#1e293b;}
    .tag{display:inline-block;padding:2px 8px;background:#eff6ff;color:#2563eb;border-radius:10px;font-size:10px;font-weight:700;margin:2px;}
    .tag.red{background:#fef2f2;color:#ef4444;}
    table{width:100%;border-collapse:collapse;margin-top:6px;}
    th{background:#f1f5f9;padding:6px 8px;text-align:left;font-size:10px;font-weight:700;color:#374151;}
    td{padding:6px 8px;border-top:1px solid #f1f5f9;font-size:11px;}
    tr:nth-child(even){background:#fafafa;}
    .evolution-entry{padding:10px;background:#f8fafc;border-radius:6px;border-left:3px solid #2563eb;margin-bottom:8px;}
    .budget-total{font-weight:800;color:#2563eb;font-size:13px;}
    @media print{body{padding:10px;}}
  </style></head><body>
  <div style="display:flex;align-items:center;gap:18px;margin-bottom:6px;padding-bottom:14px;border-bottom:2px solid #e2e8f0;">
    <img src="${LOGO_B64}" style="width:72px;height:72px;border-radius:12px;object-fit:cover;box-shadow:0 2px 10px rgba(0,0,0,0.12);"/>
    <div>
      <div style="font-size:24px;font-weight:800;color:#1e293b;margin:0;">Odontología Werbag</div>
      <div style="font-size:14px;color:#64748b;margin-top:2px;">Ficha Clínica</div>
      <div class="subtitle" style="margin-top:4px;">Generado el ${today}</div>
    </div>
  </div>

  <h2>👤 Datos Personales</h2>
  <div class="grid">
    <div class="field"><div class="field-label">Nombre completo</div><div class="field-value">${fullName||"—"}</div></div>
    <div class="field"><div class="field-label">DNI</div><div class="field-value">${patient.dni||"—"}</div></div>
    <div class="field"><div class="field-label">CUIT</div><div class="field-value">${patient.cuit||"—"}</div></div>
    <div class="field"><div class="field-label">Fecha de nacimiento</div><div class="field-value">${patient.birthDate||"—"}</div></div>
    <div class="field"><div class="field-label">Sexo</div><div class="field-value">${patient.gender||"—"}</div></div>
    <div class="field"><div class="field-label">Teléfono</div><div class="field-value">${patient.phone||"—"}</div></div>
    <div class="field"><div class="field-label">Email</div><div class="field-value">${patient.email||"—"}</div></div>
    <div class="field"><div class="field-label">Dirección</div><div class="field-value">${patient.address||"—"}</div></div>
    <div class="field"><div class="field-label">Ocupación</div><div class="field-value">${patient.occupation||"—"}</div></div>
    <div class="field"><div class="field-label">Obra Social</div><div class="field-value">${patient.obraSocial||"—"}</div></div>
    <div class="field"><div class="field-label">Nro. Afiliado</div><div class="field-value">${patient.nroAfiliado||"—"}</div></div>
  </div>

  <h2>🏥 Antecedentes Médicos</h2>
  <div style="margin-bottom:8px;"><span style="font-size:10px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">PATOLOGÍAS</span>${patient.pathologies?.length?patient.pathologies.map(p=>`<span class="tag">${p}</span>`).join(""):"<span style='color:#94a3b8'>Sin registros</span>"}</div>
  <div style="margin-bottom:8px;"><span style="font-size:10px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">MEDICACIÓN</span>${patient.medications?.length?patient.medications.map(m=>`<span class="tag">${m}</span>`).join(""):"<span style='color:#94a3b8'>Sin registros</span>"}</div>
  <div style="margin-bottom:8px;"><span style="font-size:10px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">ALERGIAS</span>${patient.allergies?.length?patient.allergies.map(a=>`<span class="tag red">${a}</span>`).join(""):"<span style='color:#94a3b8'>Sin alergias registradas</span>"}</div>

  ${teethEntries.length||milkEntries.length?`
  <h2>🦷 Odontograma — Hallazgos</h2>
  ${teethEntries.length?`<div style="margin-bottom:8px;font-weight:700;font-size:11px;color:#64748b;">Dentición permanente:</div>
  <table><thead><tr><th>Diente</th><th>Condición</th><th>Superficies</th><th>Tratamiento</th><th>Fecha</th><th>Notas</th></tr></thead><tbody>
  ${teethEntries.map(([n,d])=>`<tr><td style="font-weight:700">${n}</td><td>${CONDITIONS[d.condition]?.label||d.condition}</td><td>${Object.entries(d.surfaces||{}).map(([s,v])=>`${s}:${v==="done"?"rojo":"azul"}`).join(", ")||"—"}</td><td>${d.treatment||"—"}</td><td>${d.date||"—"}</td><td>${d.notes||"—"}</td></tr>`).join("")}
  </tbody></table>`:""}
  ${milkEntries.length?`<div style="margin:12px 0 8px;font-weight:700;font-size:11px;color:#7c3aed;">Dentición primaria (leche):</div>
  <table><thead><tr><th>Diente</th><th>Condición</th><th>Tratamiento</th><th>Notas</th></tr></thead><tbody>
  ${milkEntries.map(([n,d])=>`<tr><td style="font-weight:700">${n}</td><td>${CONDITIONS[d.condition]?.label||d.condition}</td><td>${d.treatment||"—"}</td><td>${d.notes||"—"}</td></tr>`).join("")}
  </tbody></table>`:""}
  `:""}

  ${patient.evolution?.length?`
  <h2>📝 Historial de Evolución</h2>
  ${patient.evolution.map(e=>`<div class="evolution-entry"><div style="font-weight:700;margin-bottom:4px;">${e.date}${e.tooth?` — Diente ${e.tooth}`:""} ${e.professional?`<span style="font-weight:normal;color:#64748b">· ${e.professional}</span>`:""}</div>${e.treatment?`<div style="color:#7c3aed;font-size:11px;margin-bottom:3px;">Tratamiento: ${e.treatment}</div>`:""}${e.note}</div>`).join("")}
  `:""}

  ${patient.budgets?.length?`
  <h2>💰 Presupuestos</h2>
  ${patient.budgets.map(b=>{
    const tot=b.items.reduce((s,i)=>s+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0);
    return`<div style="margin-bottom:16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
    <div style="font-weight:700;margin-bottom:6px;">${b.title} <span style="font-size:10px;color:#64748b;font-weight:normal">${b.date} · ${b.status}</span></div>
    <table><thead><tr><th>Tratamiento</th><th>Diente</th><th>Cant.</th>${b.showPrices?"<th>Precio</th><th>Subtotal</th>":""}</tr></thead>
    <tbody>${b.items.map(i=>`<tr><td>${i.description}</td><td>${i.tooth||"—"}</td><td>${i.quantity}</td>${b.showPrices?`<td>$${(parseFloat(i.price)||0).toLocaleString("es-AR")}</td><td>$${((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)).toLocaleString("es-AR")}</td>`:""}</tr>`).join("")}</tbody>
    ${b.showPrices?`<tfoot><tr><td colspan="4" style="text-align:right;font-weight:700;">TOTAL</td><td class="budget-total">$${tot.toLocaleString("es-AR")}</td></tr></tfoot>`:""}
    </table>${b.notes?`<div style="margin-top:8px;color:#64748b;font-size:11px;">${b.notes}</div>`:""}</div>`;
  }).join("")}
  `:""}

  <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
    Odontología Werbag — Ficha generada el ${today} — Documento confidencial
  </div>
  </body></html>`;

  // Abrir en nueva ventana con document.write (más compatible)
  const win=window.open("","_blank","width=900,height=700");
  if(win){
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(()=>win.print(),800);
  } else {
    // Popup bloqueado: descargar como archivo HTML
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`ficha-${(patient.lastName||"paciente").toLowerCase()}.html`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
}

// ─── PATIENT FORM ─────────────────────────────────────────────────────────────
function PatientForm({patient,onChange}){
  const set=(f,v)=>onChange({...patient,[f]:v});
  return(<div>
    <SectionTitle icon="👤" title="Datos Personales"/>
    <div style={gs}>
      <Field label="Nombre" value={patient.firstName} onChange={v=>set("firstName",v)} placeholder="Nombre"/>
      <Field label="Apellido" value={patient.lastName} onChange={v=>set("lastName",v)} placeholder="Apellido"/>
      <Field label="DNI / Cédula" value={patient.dni} onChange={v=>set("dni",v)} placeholder="00.000.000"/>
      <Field label="CUIT" value={patient.cuit} onChange={v=>set("cuit",v)} placeholder="20-00000000-0"/>
      <Field label="Fecha de nacimiento" value={patient.birthDate} onChange={v=>set("birthDate",v)} type="date"/>
      <div><label style={ls}>Sexo</label><select value={patient.gender} onChange={e=>set("gender",e.target.value)} style={is}><option value="">Seleccionar</option><option value="femenino">Femenino</option><option value="masculino">Masculino</option><option value="otro">Otro</option></select></div>
      <Field label="Teléfono" value={patient.phone} onChange={v=>set("phone",v)} placeholder="+54 9 11 0000-0000" type="tel"/>
      <Field label="Email" value={patient.email} onChange={v=>set("email",v)} placeholder="email@ejemplo.com" type="email"/>
      <Field label="Ocupación" value={patient.occupation} onChange={v=>set("occupation",v)} placeholder="Profesión u ocupación"/>
    </div>
    <Field label="Dirección" value={patient.address} onChange={v=>set("address",v)} placeholder="Calle, número, ciudad"/>

    <SectionTitle icon="🏥" title="Cobertura Médica"/>
    <div style={gs}>
      <Field label="Obra Social / Prepaga" value={patient.obraSocial} onChange={v=>set("obraSocial",v)} placeholder="Ej: OSDE, Swiss Medical"/>
      <Field label="Nro. de Afiliado" value={patient.nroAfiliado} onChange={v=>set("nroAfiliado",v)} placeholder="000000000"/>
    </div>

    <SectionTitle icon="💊" title="Antecedentes Médicos"/>
    <TagInput label="Patologías preexistentes" value={patient.pathologies} onChange={v=>set("pathologies",v)} suggestions={COMMON_PATHOLOGIES} placeholder="Escribir o seleccionar..."/>
    <TagInput label="Medicación actual" value={patient.medications} onChange={v=>set("medications",v)} suggestions={COMMON_MEDICATIONS} placeholder="Escribir o seleccionar..."/>
    <TagInput label="Alergias" value={patient.allergies} onChange={v=>set("allergies",v)} suggestions={COMMON_ALLERGIES} placeholder="Escribir o seleccionar..."/>

    <SectionTitle icon="🦷" title="Antecedentes Odontológicos"/>
    <div style={gs}>
      <Field label="Última consulta" value={patient.lastVisit} onChange={v=>set("lastVisit",v)} type="date"/>
      <Field label="Odontólogo/a anterior" value={patient.previousDentist} onChange={v=>set("previousDentist",v)} placeholder="Nombre del profesional"/>
    </div>
    <div><label style={ls}>Observaciones generales</label>
      <textarea value={patient.dentalNotes} onChange={e=>set("dentalNotes",e.target.value)} placeholder="Motivo de consulta, antecedentes relevantes..." rows={4} style={{...is,resize:"vertical",fontFamily:"inherit"}}/></div>
  </div>);
}

// ─── PATIENT LIST ─────────────────────────────────────────────────────────────
function DeudaBadge(p){
  const budgets=(p.budgets||[]).filter(b=>b.showPrices&&b.items?.length>0);
  const totalPres=budgets.reduce((s,b)=>s+b.items.reduce((ss,i)=>ss+((parseFloat(i.price)||0)*(parseInt(i.quantity)||1)),0),0);
  const totalPag=(p.payments||[]).reduce((s,pp)=>s+(parseFloat(pp.amount)||0),0);
  const deuda=Math.max(0,totalPres-totalPag);
  if(deuda<=0) return null;
  return <span style={{marginLeft:6,color:"#ef4444",fontWeight:700,fontSize:10}}>💰${deuda.toLocaleString("es-AR",{maximumFractionDigits:0})}</span>;
}

function PatientList({patients,allPatients,onSelect,onNew,selectedId,currentProfId}){
  const [search,setSearch]=useState("");
  const isSearching=search.trim().length>0;
  // Con búsqueda: busca en todos los pacientes; sin búsqueda: solo los propios
  const pool=isSearching?allPatients:patients;
  const filtered=pool.filter(p=>`${p.firstName} ${p.lastName} ${p.dni}`.toLowerCase().includes(search.toLowerCase()));
  const ownIds=new Set(patients.map(p=>p.id));

  return(<div style={{height:"100%",display:"flex",flexDirection:"column"}}>
    <div style={{padding:"16px 16px 12px",borderBottom:"1px solid #e2e8f0"}}>
      <button onClick={onNew} style={{...btnPrimary,width:"100%",marginBottom:10,boxShadow:"0 4px 12px rgba(37,99,235,0.25)"}}>+ Nuevo Paciente</button>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Nombre o DNI..." style={{...is,margin:0}}/>
      {isSearching&&<div style={{fontSize:10,color:"#f59e0b",fontWeight:600,marginTop:5,textAlign:"center"}}>
        🔍 Buscando en todos los pacientes
      </div>}
    </div>
    <div style={{flex:1,overflowY:"auto"}}>
      {filtered.length===0?(<div style={{padding:24,textAlign:"center",color:"#94a3b8",fontSize:13}}>{search?"Sin resultados":"No hay pacientes aún"}</div>)
        :filtered.map(p=>{
          const isOwn=ownIds.has(p.id);
          return(<div key={p.id} onClick={()=>onSelect(p.id)}
            style={{padding:"11px 16px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",
              backgroundColor:selectedId===p.id?"#eff6ff":isOwn?"#fff":"#fffbeb",
              borderLeft:selectedId===p.id?"3px solid #2563eb":isOwn?"3px solid transparent":"3px solid #f59e0b"}}
            onMouseEnter={e=>{if(selectedId!==p.id)e.currentTarget.style.backgroundColor=isOwn?"#f8fafc":"#fef9c3";}}
            onMouseLeave={e=>{if(selectedId!==p.id)e.currentTarget.style.backgroundColor=isOwn?"#fff":"#fffbeb";}}>
            <div style={{fontWeight:700,fontSize:13,color:"#1e293b",display:"flex",alignItems:"center",gap:5}}>
              {p.firstName||p.lastName?`${p.lastName}, ${p.firstName}`:"Sin nombre"}
              {!isOwn&&<span style={{fontSize:9,fontWeight:700,backgroundColor:"#fde68a",color:"#92400e",padding:"2px 6px",borderRadius:6}}>AJENO ⚠</span>}
            </div>
            <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
              {p.dni&&`DNI: ${p.dni}`}
              {p.obraSocial&&<span style={{marginLeft:6,color:"#7c3aed"}}>· {p.obraSocial}</span>}
              {p.allergies?.length>0&&<span style={{marginLeft:6,color:"#ef4444",fontWeight:700}}>⚠</span>}
{DeudaBadge(p)}
            </div>
          </div>);
        })}
    </div>
    <div style={{padding:10,borderTop:"1px solid #f1f5f9",fontSize:11,color:"#94a3b8",textAlign:"center"}}>
      {patients.length} paciente{patients.length!==1?"s":""} propio{patients.length!==1?"s":""}
      {isSearching&&allPatients.length>patients.length&&<span> · {allPatients.length-patients.length} ajeno{allPatients.length-patients.length!==1?"s":""}</span>}
    </div>
  </div>);
}


// ─── PROFESIONALES ────────────────────────────────────────────────────────────
// Las contraseñas se almacenan hasheadas con SHA-256 (hex).
// Para cambiarlas: usar cualquier generador SHA-256 online con el texto plano.
// Valores por defecto: "werbag1".."werbag5" → hash correspondiente
const LOGO_B64 = "data:image/jpeg;base64,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3yS3cBlZfbPxH2Pneh6L5Da1nXzJSuNsAt3waqOx5lmH+9vN/AbvxvU5lGT7XkKGpNBrrJhX0T7H8VW3i+v9JH+aMyfSivmUkPppfzEzr7N8q+ZiTXYAm9jzMlSayVDls/rr4zvvM9CjQRPp+enETQ8SKChwKmTOzZ19Q+kfE/c+L6nJoMH2vNGEyZa9nbNqV7589bl6fvzivkf0Xz+r1dfnzuvSfTfkfgUb6l+euTe+jyGlO7OdW2rZSaVkxS1CJU5M1G2rTGrKTqVkqrbaslWoWXqYToqY2qdk1tkykUNUyttW21baajbVttWnRW21Jyk1kqTSRmTK1IZVTMTW0EmQlWlAB4mmr1C6Lkqmyk6VSdqyVJoYTxTFDzUzl3qZ55qZreTTQjglKVtWSrTJEccrNZl0TK1J20yUriVuF4imb9BqXtqTtqG1dDquI91MofamKnk0yl5qQZRKytq22mSMmlZuJXSkq1JytMOCppML0oQuYpm6VMy9tSYXqCM8SsxPNTGH2pjn2puZZaSZC6VtpspOpW2rbatlJpW2rbattq22rKTqVEKrZKqToime2rbatlJpOUmsrRS9tW21bZNK21bbVttW21JVtScpMuSrTROVScrVtlSpytQstVJytMlW1bbS7bVttMnKTKjFTQ5XqRl6tlasrKpOUmonaslWpKomZSVakL2pGXqRBES5eTStpqEL1IgiKhJIqMTUPE1DlerbKrbabbak5WrbaXbalbabJUmk5WpOVqTlJrbKlTlaZOVqFBkyjxNQ5lVIlSqTlabZWlSrabbaonaspOrbaspOpSF6pQrVttWUlVJmEUvI1MttSlImttqyVakqSqttq0aa2yqydqVkLrbattpdlJm22rJVq2VqTlaonatlJl22m2mK22l22m22rZWlTpittpttpdsqkq2m22rbJlVoXSVK0yUrVSMbUHK1JxtQcvUjOE0HG1By5lSk6ZhKUugKldDxNQ0q1ZKk0rJVWyVVttLspNZSVVC0LmRCk1lRqjK1JSrVlJmWMpM220u21JytNtlUnKTLEaZpUlUu2VMnaKXtqyF6k7attqykTSk5NKUNVLkaqyYmtk6makql20TTkqrZOpW2rZWpOyqTE6tsqtpittqytpU7abbaVO2mJk6lbaslSZVbalJmJpjaspKqyVasnaVWSqk7attq22pW2rbKpO2m20S2/pfjSMtfZU+OLTT2KfHNXsifHdXsG8f1exr8Z1ezk8UVXs6PGdXs8+Lqr2aPGJr2Jfiy69mR45q9mX4tq9pjxmK9qaeQzKtSVdGSVbVttWUma0pVLEbTStE0pE6onatsmVSZmkqSqk7abbattq2UmlRprRplTp00K2qJ2rZWrbatk6ttqUmJraJrROpKtqy0RU5OrbameSqXKSqZOVqTtqmdqWjattq2UmlaYrbJpW2pScmlbakqTqiVattq22rbaspKqyVJlykqm22lUnatsmlbattqVtq2jTSrTUbaXJypslWlSlWpMrTMnTNZJE0nKitK4pOUmtE6oy9ScpNRKtKnbTaJVLsrUnK0ycrVttW2TSslVZSVVsnVMpVWTtWUnUpO1bZNKUnUpO1bbVttW21K21bZNK21bbVE6KlSYpadq20VGVqSpOqYyaVtqVkqrbRUpUmk5WpiraXKTplJVqTtqyk6lbKpOUip21baKnaKmJTSspNZSVVttW21ZKk0rbVttLlbVttNttW21bbUlW1bbVtpljbTKUhcu2VMnbVkqTSshdJ2TRE7UrbVsrUnZVJytSdtW21TMxScqKQrKpOyqSratlJrKTq22rbaslWrbattqUlSa22rJ2pWTqUpKqTlRSFbVspNbbVttW21bTFbbVlJmp21ZKtSVJmp21baKmNFbbUnKioUnSqUMlbbTRO1J21NcnVlbS7J0ykqioytW21KTtW21bbVtE1ttSttSVbVtlUnbS7bVttNttWUnUrJ1K21bbVttLkqTMrJ1K20uVtWidWUNUysnUpE6ttqyValo2pW2rTGrbalaIrbJpWmKVoilJ2rKTqUlSaVk6lZKq2TqVkqrbaonJpW2rbatk6lbak5WpOUmlbaspOrbaspOrbaspM1KdqVk6lZOpUaa22raIpWTqlY5rQpNbbVkq1JVtW21ZSdSsnVspNbbUz20qk7VttW202UnUrbSxO0221bbVtEy7bTKTlUnZUu202yk1lJ1bbVtpqNlUnTEuUnTKydWUlVJyky5SVVkqTSttMpO1K0aWcpM220qcpM2mdSVRNbbUpOVW21KTtWSpNK21bbVtMVttSslVJQVNbJ1K21aY1K21bJVLttNttSdlUlSVVtk1lJVW2TSslVbbVttLsnTK2TWyVVlJVWSpNKUNVK2TU7TScpNJVtW21ZSdWSrSpVETKyVVttWydSk7VsjUDJVWytKNW1bbTZSdUztSVJVLttNttLttNttSttScrVttSk7Vtk1ttWUlUu21TG1bbVttNttKrJVW202ytSVaKjaanbUpKdStEy7bVtEzZSdW20u2iaVJVWmNSYWmoWlVJXGrbKpO2pWTq22lyVaZKsmVW2mVtpdtpttq2Tq22rbKrbattqTlak7JomSqslSa2yqTtq2Umttq2VqSpKqVk6pnatk6ttq200jKTSttSVbVttW21J21bIXSdk03UNUpMlVJ20220u2022VLtk0rbVttNttW20qttNk7Sq2TMrbS7bTJytW20u21bbUlSVVtkzK20u21KydMrbSzG0ysnUrbVsnVlRMu0RMrbVttW20sTEzQvatk6ttq0QqoWlVbIJUbak5WraYl22mydqyk6lbalJ2rbattq22rbalZKq22rbJrJUmspK6nbUnbVspNZSdW21KydWUlVbbVlJ1bbVttW21bZNK21bbVttW2TW21bIXSUrimeVqVkqrbattq22rKTqUnaXKTqVsmZW2rROqFp1bbS7bTRO1K20uyVVtMTbbVtlUnbS6Y1bbVspM221baZZSpNZSVTKTtLspNZW0ydtWnTLonVtoqdomnbVtlUnKTW20sTtNlbVsiaVtpUSrTZKtScpNbRNK21aYTSsmKmFppWQuttq22rbIpe2rbakLTqJtqTpilJ2rbaslSaVtqyk6lJ2pW2rJUKlqSqXJUmbbattq22pW2rJUmkwvVMZFTo1NttKrbTbbVttW21bbVttW21bbS7bTZW0uUnTbLRW2ip21bbUrbVtk0uEqrbaXJyaJtq22m22rbaVW2rZOpW2m22pWTqUnJpSk6ttqyk6spOrKTpZnaZWSqk6IpWTqVEKpW2pMTqVtpUwtM20TW21QtKpdsmZSdpdtplShVJ21K20qdomlSJpWTpdtFToXWUnTbJVW21ZO1KyVVMZNKSrUnKTS5Sqk7aspOpSVJrbTUp2rbalZOpSdq2yaUidLGnTNdtLlbTbbS7bVttW20221bbS7bVttNlaKnbVttUTtWyk1ttWjTSsnS7RM2yk1topeSqXaYrJiaVkqrbKpOVpslSa22lVk6bbKl22rbalJyqTlJmVkqrbatE6VOyZlbaspOqVjmp0TSshdZKk1ttWidKrbTZKkyqT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";

const PROFESSIONALS = [
  {id:"prof1", name:"Dr./Dra. 1", color:"#2563eb"},
  {id:"prof2", name:"Dr./Dra. 2", color:"#7c3aed"},
  {id:"prof3", name:"Dr./Dra. 3", color:"#0891b2"},
  {id:"prof4", name:"Dr./Dra. 4", color:"#059669"},
  {id:"prof5", name:"Dr./Dra. 5", color:"#d97706"},
];

async function sha256hex(text){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [selProf,setSelProf]=useState(null);
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [checking,setChecking]=useState(false);
  const [profNames,setProfNames]=useState({});

  const [profGenders,setProfGenders]=useState({});

  // Cargar nombres y géneros personalizados de storage
  useEffect(()=>{
    (async()=>{
      const names={};
      const genders={};
      for(const p of PROFESSIONALS){
        try{
          const rn=await sGet(`prof:name:${p.id}`);
          if(rn?.value){
            const v=JSON.parse(rn.value);
            if(v&&typeof v==="string") names[p.id]=v;
          }
        }catch{}
        try{
          const rg=await sGet(`prof:gender:${p.id}`);
          if(rg?.value){
            const v=JSON.parse(rg.value);
            if(v&&typeof v==="string") genders[p.id]=v;
          }
        }catch{}
        // También intentar cargar desde el perfil completo como fallback
        try{
          const rp=await sGet(`prof:profile:${p.id}`);
          if(rp?.value){
            const d=JSON.parse(rp.value);
            if(d?.name&&!names[p.id]) names[p.id]=d.name;
            if(d?.gender&&!genders[p.id]) genders[p.id]=d.gender;
          }
        }catch{}
      }
      setProfNames(names);
      setProfGenders(genders);
    })();
  },[]);

  const getDisplayName=(p)=>profNames[p.id]||p.name;
  const getProfEmoji=(p)=>profGenders[p.id]==="dra"?"👩‍⚕️":"👨‍⚕️";

  const handleLogin=async()=>{
    if(!selProf||!password) return;
    setChecking(true);setError("");
    const hash=await sha256hex(password);
    // Verificar contra hash guardado; si no hay hash guardado aún, aceptar cualquier contraseña
    // y guardarla como la primera contraseña del profesional
    const stored=await sGet(`prof:hash:${selProf.id}`);
    if(!stored?.value){
      // Primera vez: guardar hash y entrar
      await sSet(`prof:hash:${selProf.id}`,hash);
      onLogin(selProf,profNames,profGenders);
    } else {
      const storedHash=JSON.parse(stored.value);
      if(hash===storedHash){
        onLogin(selProf,profNames,profGenders);
      } else {
        setError("Contraseña incorrecta");
        setChecking(false);
      }
    }
  };

  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#f0f4ff 0%,#faf5ff 100%)",fontFamily:"'Inter',system-ui,sans-serif",padding:20}}>
      <div style={{backgroundColor:"#fff",borderRadius:20,padding:40,width:"100%",maxWidth:440,
        boxShadow:"0 20px 60px rgba(37,99,235,0.12)",border:"1px solid #e2e8f0"}}>

        {/* Logo / Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src={LOGO_B64} alt="Odontología Werbag"
            style={{width:110,height:110,borderRadius:16,objectFit:"cover",margin:"0 auto 14px",display:"block",
              boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}/>
          <div style={{fontSize:22,fontWeight:800,color:"#1e293b"}}>Odontología Werbag</div>
          <div style={{fontSize:13,color:"#94a3b8",marginTop:4}}>Sistema de Gestión Clínica</div>
        </div>

        {/* Selector de profesional */}
        {!selProf?(
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:0.5,marginBottom:12,textAlign:"center"}}>
              Seleccioná tu perfil
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {PROFESSIONALS.map(p=>(
                <button key={p.id} onClick={()=>{setSelProf(p);setPassword("");setError("");}}
                  style={{padding:"13px 16px",borderRadius:12,border:`2px solid #e2e8f0`,
                    backgroundColor:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:12,
                    transition:"all 0.15s",textAlign:"left"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=p.color;e.currentTarget.style.backgroundColor="#f8fafc";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.backgroundColor="#fff";}}>
                  <div style={{width:38,height:38,borderRadius:10,backgroundColor:p.color+"22",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                    {getProfEmoji(p)}
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{getDisplayName(p)}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>Profesional</div>
                  </div>
                  <div style={{marginLeft:"auto",color:"#94a3b8",fontSize:16}}>›</div>
                </button>
              ))}
            </div>
          </div>
        ):(
          <div>
            {/* Volver */}
            <button onClick={()=>{setSelProf(null);setPassword("");setError("");}}
              style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:13,
                display:"flex",alignItems:"center",gap:4,marginBottom:20,padding:0}}>
              ‹ Cambiar profesional
            </button>

            {/* Profesional seleccionado */}
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
              backgroundColor:selProf.color+"11",borderRadius:12,border:`1px solid ${selProf.color}33`,marginBottom:24}}>
              <div style={{width:40,height:40,borderRadius:10,backgroundColor:selProf.color+"22",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
                {getProfEmoji(selProf)}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{getDisplayName(selProf)}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Ingresá tu contraseña</div>
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#374151",
                marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Contraseña</label>
              <input type="password" value={password}
                onChange={e=>{setPassword(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                placeholder="Ingresá tu contraseña"
                autoFocus
                style={{width:"100%",padding:"11px 14px",borderRadius:10,
                  border:`2px solid ${error?"#ef4444":"#e2e8f0"}`,
                  fontSize:14,color:"#1e293b",backgroundColor:"#fff",
                  boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}
                onFocus={e=>e.target.style.borderColor=error?"#ef4444":selProf.color}
                onBlur={e=>e.target.style.borderColor=error?"#ef4444":"#e2e8f0"}/>
              {error&&<div style={{fontSize:12,color:"#ef4444",marginTop:6,fontWeight:600}}>⚠ {error}</div>}
              <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>
                Primera vez: ingresá cualquier contraseña para establecerla.
              </div>
            </div>

            <button onClick={handleLogin} disabled={checking||!password}
              style={{width:"100%",padding:"12px",borderRadius:10,border:"none",
                background:`linear-gradient(135deg,${selProf.color},#7c3aed)`,
                color:"#fff",fontWeight:700,fontSize:14,cursor:checking||!password?"not-allowed":"pointer",
                opacity:checking||!password?0.7:1}}>
              {checking?"Verificando...":"Ingresar →"}
            </button>
          </div>
        )}

        <div style={{textAlign:"center",marginTop:24,fontSize:11,color:"#94a3b8"}}>
          Odontología Werbag © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}


// ─── PROFESSIONAL PROFILE MODAL ──────────────────────────────────────────────
function ProfessionalProfile({currentProf,onClose,onUpdate}){
  const [name,setName]=useState(currentProf.name||"");
  const [gender,setGender]=useState(currentProf.gender||"dr"); // "dr" | "dra"
  const [specialty,setSpecialty]=useState("");
  const [matricula,setMatricula]=useState("");
  const [phone,setPhone]=useState("");
  const [whatsapp,setWhatsapp]=useState("");
  const [emailRecovery,setEmailRecovery]=useState("");
  const [newPwd,setNewPwd]=useState("");
  const [confirmPwd,setConfirmPwd]=useState("");
  const [pwdError,setPwdError]=useState("");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState("");
  const [loadingProfile,setLoadingProfile]=useState(true);

  const emoji=gender==="dra"?"👩‍⚕️":"👨‍⚕️";

  useEffect(()=>{
    (async()=>{
      setLoadingProfile(true);
      try{
        const r=await sGet(`prof:profile:${currentProf.id}`);
        if(r?.value){
          const d=JSON.parse(r.value);
          setName(d.name||currentProf.name);
          setGender(d.gender||currentProf.gender||"dr");
          setSpecialty(d.specialty||"");
          setMatricula(d.matricula||"");
          setPhone(d.phone||"");
          setWhatsapp(d.whatsapp||"");
          setEmailRecovery(d.emailRecovery||"");
        }
      }catch(e){console.error("Error cargando perfil",e);}
      finally{setLoadingProfile(false);}
    })();
  },[currentProf.id]);

  const handleSave=async()=>{
    if(newPwd){
      if(newPwd!==confirmPwd){setPwdError("Las contraseñas no coinciden");return;}
      if(newPwd.length<4){setPwdError("Mínimo 4 caracteres");return;}
    }
    setSaving(true);setPwdError("");
    const profile={name,gender,specialty,matricula,phone,whatsapp,emailRecovery};
    await sSet(`prof:profile:${currentProf.id}`,profile);
    await sSet(`prof:name:${currentProf.id}`,name);
    await sSet(`prof:gender:${currentProf.id}`,gender);
    if(newPwd){
      const hash=await sha256hex(newPwd);
      await sSet(`prof:hash:${currentProf.id}`,hash);
    }
    setSaving(false);setSaved("✓ Perfil guardado");
    setTimeout(()=>setSaved(""),2500);
    onUpdate({...currentProf,name,gender});
    setNewPwd("");setConfirmPwd("");
  };

  return(
    <div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.55)",zIndex:3000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{backgroundColor:"#fff",borderRadius:18,padding:28,width:"100%",maxWidth:500,
        maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:800,color:"#1e293b"}}>{emoji} Mi perfil profesional</h3>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {loadingProfile&&<span style={{fontSize:11,color:"#94a3b8"}}>Cargando...</span>}
            <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8"}}>✕</button>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
          backgroundColor:currentProf.color+"11",borderRadius:10,border:`1px solid ${currentProf.color}33`,marginBottom:20}}>
          <div style={{width:44,height:44,borderRadius:12,backgroundColor:currentProf.color+"22",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{emoji}</div>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{name||currentProf.name}</div>
            <div style={{fontSize:11,color:"#64748b"}}>ID: {currentProf.id}</div>
          </div>
        </div>

        <div style={{marginBottom:4}}><label style={{...ls,marginBottom:6}}>DATOS DEL PROFESIONAL</label></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div>
            <label style={ls}>Tratamiento</label>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={()=>setGender("dr")}
                style={{flex:1,padding:"9px 6px",borderRadius:9,border:`2px solid ${gender==="dr"?"#2563eb":"#e2e8f0"}`,
                  backgroundColor:gender==="dr"?"#eff6ff":"#fff",color:gender==="dr"?"#2563eb":"#64748b",
                  fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                👨‍⚕️ Dr.
              </button>
              <button onClick={()=>setGender("dra")}
                style={{flex:1,padding:"9px 6px",borderRadius:9,border:`2px solid ${gender==="dra"?"#7c3aed":"#e2e8f0"}`,
                  backgroundColor:gender==="dra"?"#f5f3ff":"#fff",color:gender==="dra"?"#7c3aed":"#64748b",
                  fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                👩‍⚕️ Dra.
              </button>
            </div>
          </div>
          <div>
            <label style={ls}>Matrícula</label>
            <input value={matricula} onChange={e=>setMatricula(e.target.value)} placeholder="MP / MN 00000"
              style={is} onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={ls}>Nombre completo</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre y Apellido"
              style={is} onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={ls}>Especialidad</label>
            <input value={specialty} onChange={e=>setSpecialty(e.target.value)} placeholder="Ej: Odontología general"
              style={is} onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          </div>
          <div>
            <label style={ls}>Teléfono</label>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+54 9 11 0000-0000" type="tel"
              style={is} onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          </div>
          <div>
            <label style={{...ls,color:"#166534"}}>📱 WhatsApp {!whatsapp&&<span style={{color:"#ef4444",fontWeight:700}}>— requerido para recibir avisos</span>}</label>
            <input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="5491100000000" type="tel"
              style={{...is,borderColor:!whatsapp?"#fca5a5":"#e2e8f0"}}
              onFocus={e=>e.target.style.borderColor="#25d366"} onBlur={e=>e.target.style.borderColor=!whatsapp?"#fca5a5":"#e2e8f0"}/>
            <div style={{fontSize:10,color:"#6b7280",marginTop:3}}>
              Código de país sin + (ej: 5491100000000) · Necesario para que otros profesionales te avisen al atender tus pacientes
            </div>
          </div>
        </div>

        <div style={{padding:"12px 14px",backgroundColor:"#fef9c3",borderRadius:10,border:"1px solid #fde68a",marginBottom:16}}>
          <label style={{...ls,color:"#92400e"}}>📧 Email de recuperación de contraseña</label>
          <input value={emailRecovery} onChange={e=>setEmailRecovery(e.target.value)}
            placeholder="tu@email.com" type="email"
            style={{...is,border:"2px solid #fde68a"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#fde68a"}/>
          <div style={{fontSize:11,color:"#92400e",marginTop:6}}>
            Este email se muestra como contacto de recupero. La funcionalidad de envío de email puede configurarse con el administrador del sistema.
          </div>
        </div>

        <div style={{borderTop:"1px solid #f1f5f9",paddingTop:16,marginBottom:16}}>
          <label style={ls}>🔐 Cambiar contraseña (opcional)</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
            <div>
              <label style={ls}>Nueva contraseña</label>
              <input type="password" value={newPwd} onChange={e=>{setNewPwd(e.target.value);setPwdError("");}}
                placeholder="Mínimo 4 caracteres"
                style={is} onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
            </div>
            <div>
              <label style={ls}>Confirmar contraseña</label>
              <input type="password" value={confirmPwd} onChange={e=>{setConfirmPwd(e.target.value);setPwdError("");}}
                placeholder="Repetir contraseña"
                style={{...is,borderColor:pwdError?"#ef4444":undefined}}
                onFocus={e=>e.target.style.borderColor=pwdError?"#ef4444":"#2563eb"} onBlur={e=>e.target.style.borderColor=pwdError?"#ef4444":"#e2e8f0"}/>
            </div>
          </div>
          {pwdError&&<div style={{fontSize:12,color:"#ef4444",marginTop:6,fontWeight:600}}>⚠ {pwdError}</div>}
        </div>

        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {saved&&<span style={{fontSize:12,color:"#22c55e",fontWeight:700}}>{saved}</span>}
          <div style={{flex:1}}/>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            style={{...btnPrimary,opacity:saving?0.7:1}}>
            {saving?"Guardando...":"💾 Guardar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── WHATSAPP NOTIFY MODAL ────────────────────────────────────────────────────
function WhatsAppModal({modal,currentProf,onConfirmed,onCancel}){
  const {patient,ownerProf}=modal;
  const patientName=`${patient.firstName||""} ${patient.lastName||""}`.trim()||"Sin nombre";
  const today=new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  const drTitle=currentProf.gender==="dra"?"Dra.":"Dr.";
  const ownerTitle=ownerProf.gender==="dra"?"Dra.":"Dr.";

  const msg=`Hola ${ownerTitle} ${ownerProf.name}, te aviso que voy a atender a tu paciente *${patientName}* el día de hoy (${today}).\n— ${drTitle} ${currentProf.name}`;
  const waNumber=(ownerProf.whatsapp||"").replace(/\D/g,"");
  const waUrl=`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;

  const handleSend=()=>{
    if(!waNumber){
      alert(`El/La ${ownerTitle} ${ownerProf.name} no tiene número de WhatsApp registrado.\nPedile que lo complete en su perfil.`);
      return;
    }
    window.open(waUrl,"_blank");
    // Dar 1.5s para que abra WA, luego confirmar acceso
    setTimeout(()=>onConfirmed(patient),1500);
  };

  return(
    <div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.6)",zIndex:4000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{backgroundColor:"#fff",borderRadius:18,padding:28,width:"100%",maxWidth:460,
        boxShadow:"0 24px 64px rgba(0,0,0,0.35)"}}>

        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:44,marginBottom:8}}>⚠️</div>
          <div style={{fontSize:17,fontWeight:800,color:"#1e293b",marginBottom:4}}>Paciente de otro profesional</div>
          <div style={{fontSize:13,color:"#64748b"}}>Este paciente pertenece a {ownerTitle} {ownerProf.name}</div>
        </div>

        <div style={{backgroundColor:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:"#166534",textTransform:"uppercase",marginBottom:8}}>
            📱 Mensaje que se enviará por WhatsApp
          </div>
          <div style={{fontSize:13,color:"#1e293b",lineHeight:1.6,whiteSpace:"pre-wrap",
            backgroundColor:"#fff",padding:"10px 14px",borderRadius:8,border:"1px solid #dcfce7"}}>
            {msg}
          </div>
        </div>

        {!waNumber&&(
          <div style={{backgroundColor:"#fef3c7",border:"1px solid #fde68a",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#92400e",fontWeight:600}}>
            ⚠ {ownerTitle} {ownerProf.name} no tiene WhatsApp registrado en su perfil. No podrás acceder hasta que lo complete.
          </div>
        )}

        <div style={{fontSize:12,color:"#64748b",textAlign:"center",marginBottom:16,
          backgroundColor:"#f8fafc",padding:"8px 12px",borderRadius:8,border:"1px solid #e2e8f0"}}>
          🔒 Para acceder a la ficha de este paciente <strong>debés enviar el aviso</strong> por WhatsApp primero.
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel}
            style={{...btnSecondary,flex:"0 0 auto",padding:"11px 18px"}}>
            Cancelar
          </button>
          <button onClick={handleSend} disabled={!waNumber}
            style={{flex:1,padding:"12px",borderRadius:10,border:"none",
              background:waNumber?"linear-gradient(135deg,#25d366,#128c7e)":"#e2e8f0",
              color:waNumber?"#fff":"#94a3b8",fontWeight:800,fontSize:14,cursor:waNumber?"pointer":"not-allowed",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{fontSize:18}}>📲</span>
            Enviar aviso y acceder a la ficha
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── CONFIRM MODAL ───────────────────────────────────────────────────────────
function ConfirmModal({msg, onOk, onCancel}){
  return(
    <div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.55)",zIndex:5000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{backgroundColor:"#fff",borderRadius:16,padding:28,width:"100%",maxWidth:380,
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:15,color:"#1e293b",fontWeight:600,marginBottom:20,lineHeight:1.5}}>{msg}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel}
            style={{flex:1,padding:"11px",borderRadius:10,border:"2px solid #e2e8f0",
              backgroundColor:"#fff",color:"#64748b",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            Cancelar
          </button>
          <button onClick={onOk}
            style={{flex:1,padding:"11px",borderRadius:10,border:"none",
              backgroundColor:"#ef4444",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── DASHBOARD (pantalla de inicio) ─────────────────────────────────────────
function Dashboard({currentProf,patients,allPatients,onSelectPatient}){
  const today=new Date().toISOString().slice(0,10);
  const [appointments,setAppointments]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const r=await sGet(`agenda:${currentProf.id}`);
        if(r?.value) setAppointments(JSON.parse(r.value));
        else setAppointments([]);
      }catch{setAppointments([]);}
      finally{setLoading(false);}
    })();
  },[currentProf.id]);

  const todayAppts=appointments
    .filter(a=>a.date===today)
    .sort((a,b)=>a.time.localeCompare(b.time));

  const getPatientName=id=>{
    const p=(allPatients||[]).find(x=>x.id===id);
    return p?`${p.lastName||""}, ${p.firstName||""}`.trim()||"Sin nombre":"Paciente";
  };
  const getPatientData=id=>(allPatients||[]).find(x=>x.id===id);

  const weekAppts=appointments
    .filter(a=>{const d=new Date(a.date+"T12:00:00");const t=new Date(today+"T12:00:00");
      const diff=(d-t)/(1000*60*60*24);return diff>0&&diff<=6;})
    .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))
    .slice(0,5);

  const drTitle=currentProf.gender==="dra"?"Dra.":"Dr.";
  const hour=new Date().getHours();
  const greeting=hour<12?"Buenos días":hour<19?"Buenas tardes":"Buenas noches";

  return(
    <div style={{padding:20,maxWidth:700,margin:"0 auto"}}>
      {/* Header saludo */}
      <div style={{marginBottom:20,padding:"20px 24px",
        background:"linear-gradient(135deg,#1e293b 0%,#2563eb 100%)",
        borderRadius:16,color:"#fff"}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:4}}>{greeting}</div>
        <div style={{fontSize:22,fontWeight:800}}>{drTitle} {currentProf.name}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4}}>
          {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
        </div>
      </div>

      {/* Stats rápidas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
        {[
          {label:"Pacientes",value:patients.length,icon:"👥",color:"#2563eb",bg:"#eff6ff"},
          {label:"Turnos hoy",value:todayAppts.length,icon:"📅",color:"#059669",bg:"#f0fdf4"},
          {label:"Esta semana",value:weekAppts.length,icon:"📆",color:"#d97706",bg:"#fffbeb"},
        ].map(({label,value,icon,color,bg})=>(
          <div key={label} style={{backgroundColor:bg,borderRadius:12,padding:"14px",border:`1px solid ${color}22`,textAlign:"center"}}>
            <div style={{fontSize:22}}>{icon}</div>
            <div style={{fontSize:24,fontWeight:800,color,lineHeight:1}}>{value}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Turnos de hoy */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:10,
          display:"flex",alignItems:"center",gap:8}}>
          📅 Turnos de hoy
          {todayAppts.length>0&&<span style={{backgroundColor:"#2563eb",color:"#fff",
            borderRadius:10,padding:"2px 8px",fontSize:11}}>{todayAppts.length}</span>}
        </div>
        {loading&&<div style={{textAlign:"center",color:"#94a3b8",padding:16,fontSize:13}}>Cargando agenda...</div>}
        {!loading&&todayAppts.length===0&&(
          <div style={{padding:"16px 20px",backgroundColor:"#f8fafc",borderRadius:10,
            border:"1px dashed #e2e8f0",fontSize:13,color:"#94a3b8",textAlign:"center"}}>
            No hay turnos agendados para hoy
          </div>
        )}
        {todayAppts.map(a=>{
          const pat=getPatientData(a.patientId);
          return(
            <div key={a.id} onClick={()=>pat&&onSelectPatient(a.patientId)}
              style={{backgroundColor:"#fff",borderRadius:10,padding:"12px 16px",marginBottom:8,
                border:"1px solid #e2e8f0",borderLeft:"4px solid #2563eb",
                display:"flex",alignItems:"center",gap:12,
                cursor:pat?"pointer":"default",transition:"background 0.15s"}}
              onMouseEnter={e=>{if(pat)e.currentTarget.style.backgroundColor="#f8fafc";}}
              onMouseLeave={e=>{e.currentTarget.style.backgroundColor="#fff";}}>
              <div style={{backgroundColor:"#eff6ff",borderRadius:8,padding:"8px 10px",
                textAlign:"center",flexShrink:0,minWidth:52}}>
                <div style={{fontSize:15,fontWeight:800,color:"#2563eb"}}>{a.time}</div>
                <div style={{fontSize:9,color:"#94a3b8"}}>{a.duration}min</div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:"#1e293b",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {getPatientName(a.patientId)}
                </div>
                {a.notes&&<div style={{fontSize:12,color:"#64748b",marginTop:2}}>{a.notes}</div>}
                {pat?.obraSocial&&<div style={{fontSize:11,color:"#7c3aed",marginTop:2}}>{pat.obraSocial}</div>}
              </div>
              {pat&&<div style={{color:"#2563eb",fontSize:18,flexShrink:0}}>›</div>}
            </div>
          );
        })}
      </div>

      {/* Próximos turnos */}
      {weekAppts.length>0&&(
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:10}}>
            📆 Próximos turnos
          </div>
          {weekAppts.map(a=>{
            const pat=getPatientData(a.patientId);
            const d=new Date(a.date+"T12:00:00");
            const dayLabel=d.toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"short"});
            return(
              <div key={a.id} onClick={()=>pat&&onSelectPatient(a.patientId)}
                style={{backgroundColor:"#fff",borderRadius:10,padding:"10px 14px",marginBottom:6,
                  border:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:10,
                  cursor:pat?"pointer":"default"}}
                onMouseEnter={e=>{if(pat)e.currentTarget.style.backgroundColor="#f8fafc";}}
                onMouseLeave={e=>{e.currentTarget.style.backgroundColor="#fff";}}>
                <div style={{fontSize:11,color:"#2563eb",fontWeight:700,flexShrink:0,minWidth:64,
                  textAlign:"center",backgroundColor:"#eff6ff",padding:"4px 6px",borderRadius:6}}>
                  {dayLabel}
                </div>
                <div style={{fontWeight:600,fontSize:12,color:"#374151",flexShrink:0}}>{a.time}</div>
                <div style={{flex:1,fontSize:13,color:"#1e293b",fontWeight:600,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {getPatientName(a.patientId)}
                </div>
                {pat&&<div style={{color:"#94a3b8",fontSize:16}}>›</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const TABS=[
  {id:"ficha",label:"📋 Ficha"},
  {id:"odontograma",label:"🦷 Odontograma"},
  {id:"evolucion",label:"📝 Evolución"},
  {id:"imagenes",label:"🩻 Imágenes"},
  {id:"presupuestos",label:"💰 Presupuestos"},
  {id:"pagos",label:"💳 Pagos"},
  {id:"turnos",label:"📅 Agenda"},
];


function DentalApp({currentProf,onLogout}){
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [activeTab,setActiveTab]=useState("ficha");
  const [saveStatus,setSaveStatus]=useState("idle"); // "idle" | "pending" | "saving" | "saved"
  const [loading,setLoading]=useState(true);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const [profData,setProfData]=useState(currentProf);
  const [waMsgModal,setWaMsgModal]=useState(null); // {patient, ownerProf} o null
  const [confirmDel,setConfirmDel]=useState(null); // {msg, onOk} o null
  const isMobile=typeof window!=="undefined"&&window.innerWidth<768;
  const autoSaveTimer=useRef(null);
  const pendingPatientRef=useRef(null);

  const [allPatients,setAllPatients]=useState([]); // todos (propios + ajenos)

  useEffect(()=>{
    if(!currentProf) return;
    (async()=>{
      setLoading(true);
      try{
        const result=await sList("patient:");
        const keys=result?.keys||[];
        const own=[], others=[];
        for(const key of keys){
          const r=await sGet(key);
          if(r?.value){
            try{
              const p=JSON.parse(r.value);
              if(!p.professionalId||p.professionalId===currentProf.id) own.push(p);
              else others.push(p);
            }catch{}
          }
        }
        own.sort((a,b)=>(a.lastName||"").localeCompare(b.lastName||""));
        others.sort((a,b)=>(a.lastName||"").localeCompare(b.lastName||""));
        setPatients(own);
        setAllPatients([...own,...others]);
      }finally{setLoading(false);}
    })();
  },[currentProf]);

  const sel=patients.find(p=>p.id===selectedId);
  const handleNew=()=>{const p=emptyPatient(currentProf.id);setPatients(prev=>[p,...prev]);setSelectedId(p.id);setActiveTab("ficha");setSidebarOpen(false);};
  const handleSelect=async id=>{
    const patient=allPatients.find(p=>p.id===id);
    if(!patient) return;
    // Si el paciente es de otro profesional, mostrar modal de WhatsApp obligatorio
    if(patient.professionalId && patient.professionalId!==currentProf.id){
      // Obtener datos del profesional dueño
      const ownerBase=PROFESSIONALS.find(p=>p.id===patient.professionalId);
      if(ownerBase){
        const rp=await sGet(`prof:profile:${ownerBase.id}`);
        const rn=await sGet(`prof:name:${ownerBase.id}`);
        const rg=await sGet(`prof:gender:${ownerBase.id}`);
        const profile=rp?.value?JSON.parse(rp.value):{};
        const ownerName=rn?.value?JSON.parse(rn.value):ownerBase.name;
        const ownerGender=rg?.value?JSON.parse(rg.value):"dr";
        const ownerProf={...ownerBase,name:ownerName,gender:ownerGender,whatsapp:profile.whatsapp||""};
        setWaMsgModal({patient,ownerProf});
        // No seleccionar aún — esperar confirmación de envío WA
        return;
      }
    }
    // Paciente propio: acceso directo
    if(!patients.find(p=>p.id===id)){
      // Agregar a lista local si no estaba
      setPatients(prev=>[...prev,patient]);
    }
    setSelectedId(id);setActiveTab("ficha");setSidebarOpen(false);
  };

  // Autoguardado con debounce de 2 segundos
  const scheduleAutoSave=useCallback((patient)=>{
    pendingPatientRef.current=patient;
    setSaveStatus("pending");
    if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current=setTimeout(async()=>{
      const toSave=pendingPatientRef.current;
      if(!toSave) return;
      setSaveStatus("saving");
      const updated={...toSave,updatedAt:new Date().toISOString()};
      await sSet(`patient:${updated.id}`,updated);
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2500);
    },2000);
  },[]);

  const handleChange=useCallback(updated=>{
    setPatients(prev=>prev.map(p=>p.id===updated.id?updated:p));
    scheduleAutoSave(updated);
  },[scheduleAutoSave]);

  // special updater for images panel (uses functional form)
  const handleChangeFunc=useCallback(updater=>{
    setPatients(prev=>prev.map(p=>{
      if(p.id!==selectedId) return p;
      const updated=updater(p);
      scheduleAutoSave(updated);
      return updated;
    }));
  },[selectedId,scheduleAutoSave]);

  const handleSaveNow=async()=>{
    if(!sel)return;
    if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSaveStatus("saving");
    const updated={...sel,updatedAt:new Date().toISOString()};
    await sSet(`patient:${updated.id}`,updated);
    setSaveStatus("saved");
    setTimeout(()=>setSaveStatus("idle"),2500);
  };
  const handleDelete=()=>{
    if(!sel)return;
    const name=`${sel.firstName||""} ${sel.lastName||""}`.trim()||"este paciente";
    setConfirmDel({
      msg:`¿Eliminar a ${name}? Esta acción no se puede deshacer.`,
      onOk:async()=>{
        setConfirmDel(null);
        if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        await sDel(`patient:${sel.id}`);
        setPatients(prev=>prev.filter(p=>p.id!==sel.id));
        setSelectedId(null);setSaveStatus("idle");
      }
    });
  };

  return(
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",display:"flex",height:"100vh",overflow:"hidden",backgroundColor:"#f8fafc"}}>
      {showProfile&&<ProfessionalProfile currentProf={profData} onClose={()=>setShowProfile(false)} onUpdate={p=>{setProfData(p);}}/>}
      {confirmDel&&<ConfirmModal msg={confirmDel.msg} onOk={confirmDel.onOk} onCancel={()=>setConfirmDel(null)}/>}
      {waMsgModal&&<WhatsAppModal modal={waMsgModal} currentProf={profData}
        onConfirmed={patient=>{
          setWaMsgModal(null);
          if(!patients.find(p=>p.id===patient.id)) setPatients(prev=>[...prev,patient]);
          setSelectedId(patient.id);setActiveTab("ficha");setSidebarOpen(false);
        }}
        onCancel={()=>setWaMsgModal(null)}/>}
      {sidebarOpen&&<div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.4)",zIndex:199}}/>}

      {/* SIDEBAR */}
      <div style={{width:255,minWidth:255,backgroundColor:"#fff",borderRight:"1px solid #e2e8f0",display:"flex",flexDirection:"column",
        position:"fixed",left:0,top:0,bottom:0,zIndex:200,
        transform:`translateX(${sidebarOpen||!isMobile?0:-280}px)`,transition:"transform 0.25s ease",
        boxShadow:sidebarOpen?"4px 0 24px rgba(0,0,0,0.15)":"none"}}>
        <div style={{padding:"12px 14px 10px",borderBottom:"1px solid #f1f5f9"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <img src={LOGO_B64} alt="Logo" style={{width:36,height:36,borderRadius:8,objectFit:"cover",flexShrink:0,boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:800,fontSize:12,color:"#1e293b",lineHeight:1.2}}>Odontología Werbag</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>Sistema de Gestión</div>
            </div>
            {isMobile&&<button onClick={()=>setSidebarOpen(false)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#94a3b8"}}>✕</button>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
            backgroundColor:currentProf.color+"11",borderRadius:8,border:`1px solid ${currentProf.color}33`}}>
            <div style={{width:26,height:26,borderRadius:7,backgroundColor:currentProf.color+"22",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>
              {profData.gender==="dra"?"👩‍⚕️":"👨‍⚕️"}
            </div>
            <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentProf.name}</div>
            </div>
            <button onClick={()=>setShowProfile(true)} title="Editar perfil"
              style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:13,padding:2,flexShrink:0}}
              onMouseEnter={e=>e.currentTarget.style.color="#2563eb"}
              onMouseLeave={e=>e.currentTarget.style.color="#94a3b8"}>
              ⚙
            </button>
            <button onClick={onLogout} title="Cerrar sesión"
              style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:13,padding:2,flexShrink:0}}
              onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
              onMouseLeave={e=>e.currentTarget.style.color="#94a3b8"}>
              ⏏
            </button>
          </div>
        </div>
        {loading?<div style={{padding:24,textAlign:"center",color:"#94a3b8"}}>Cargando...</div>
          :<PatientList patients={patients} allPatients={allPatients} onSelect={handleSelect} onNew={handleNew} selectedId={selectedId} currentProfId={currentProf.id}/>}
      </div>

      {/* MAIN */}
      <div style={{marginLeft:isMobile?0:255,flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Header */}
        <div style={{backgroundColor:"#fff",borderBottom:"1px solid #e2e8f0",padding:"11px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          {isMobile&&<button onClick={()=>setSidebarOpen(true)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#64748b",padding:4}}>☰</button>}
          {sel?(
            <>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:14,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {sel.firstName||sel.lastName?`${sel.lastName}, ${sel.firstName}`:"Nuevo paciente"}
                </div>
                {sel.allergies?.length>0&&<div style={{fontSize:10,color:"#ef4444",fontWeight:700}}>⚠ Alergias: {sel.allergies.join(", ")}</div>}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                {saveStatus==="pending"&&<span style={{fontSize:11,color:"#f59e0b",fontWeight:700,display:"flex",alignItems:"center",gap:3}}>⏱ Sin guardar</span>}
                {saveStatus==="saving"&&<span style={{fontSize:11,color:"#3b82f6",fontWeight:700,display:"flex",alignItems:"center",gap:3}}>⟳ Guardando...</span>}
                {saveStatus==="saved"&&<span style={{fontSize:11,color:"#22c55e",fontWeight:700,display:"flex",alignItems:"center",gap:3}}>✓ Guardado</span>}
                <button onClick={()=>exportPDF(sel)} title="Exportar PDF" style={{...btnSecondary,padding:"6px 11px",fontSize:12}}>📄 PDF</button>
                <button onClick={handleDelete} style={{padding:"6px 10px",borderRadius:8,border:"2px solid #fee2e2",backgroundColor:"#fff",color:"#ef4444",fontWeight:600,fontSize:12,cursor:"pointer"}}>🗑</button>
                <button onClick={handleSaveNow}
                  style={{...btnPrimary,padding:"6px 14px",fontSize:12,opacity:saveStatus==="saving"?0.7:1}}>
                  💾 Guardar
                </button>
              </div>
            </>
          ):(
            <div style={{color:"#94a3b8",fontSize:13}}>← Seleccioná un paciente o creá uno nuevo</div>
          )}
        </div>

        {sel?(
          <>
            {/* Tabs */}
            <div style={{backgroundColor:"#fff",borderBottom:"1px solid #e2e8f0",display:"flex",padding:"0 16px",flexShrink:0,overflowX:"auto"}}>
              {TABS.map(tab=>(
                <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                  style={{padding:"11px 13px",border:"none",background:"none",cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap",
                    color:activeTab===tab.id?"#2563eb":"#94a3b8",
                    borderBottom:activeTab===tab.id?"2px solid #2563eb":"2px solid transparent",marginBottom:-1}}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{flex:1,overflowY:"auto",padding:20}}>
              {activeTab==="ficha"&&<PatientForm patient={sel} onChange={handleChange}/>}
              {activeTab==="odontograma"&&(
                <OdontogramPanel
                  teeth={sel.teeth||{}} milkTeeth={sel.milkTeeth||{}}
                  onTeethChange={t=>handleChange({...sel,teeth:t,updatedAt:new Date().toISOString()})}
                  onMilkChange={t=>handleChange({...sel,milkTeeth:t,updatedAt:new Date().toISOString()})}
                />
              )}
              {activeTab==="evolucion"&&<EvolutionPanel patient={sel} onChange={handleChange}/>}
              {activeTab==="imagenes"&&<ImagesPanel patient={sel} onChange={handleChange}/>}
              {activeTab==="presupuestos"&&<BudgetPanel patient={sel} onChange={handleChange} currentProf={profData}/>}
              {activeTab==="pagos"&&<PaymentsPanel patient={sel} onChange={handleChange}/>}
              {activeTab==="turnos"&&<AppointmentsPanel patient={sel} onChange={handleChange} currentProf={profData} allPatients={allPatients} onSelectPatient={id=>{handleSelect(id);}}/>}
            </div>
          </>
        ):(
          <div style={{flex:1,overflowY:"auto"}}>
            <Dashboard currentProf={profData} patients={patients} allPatients={allPatients}
              onSelectPatient={id=>{handleSelect(id);setSidebarOpen(false);}}/>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function RootApp(){
  const [currentProf,setCurrentProf]=useState(null);
  const [profNames,setProfNames]=useState({});

  const handleLogin=(prof,names,genders={})=>{
    // Aplicar nombre personalizado y género al objeto del profesional
    const displayProf={...prof, name: names[prof.id]||prof.name, gender: genders[prof.id]||"dr"};
    setCurrentProf(displayProf);
    setProfNames(names);
  };
  const handleLogout=()=>{setCurrentProf(null);};

  if(!currentProf) return <LoginScreen onLogin={handleLogin}/>;
  return <DentalApp currentProf={currentProf} onLogout={handleLogout}/>;
}
