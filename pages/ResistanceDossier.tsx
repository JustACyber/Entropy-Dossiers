
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { OrdoService } from '../services/firebase';
import { Character, Attributes } from '../types';
import { ResistanceNumberInput, ResistanceToggle, ResistanceDeleteBtn, ResistanceDragHandle, ResistanceEditModal } from '../components/Components';
import { debounce } from 'lodash';

// --- HELPERS ---
const getMod = (val: number) => Math.floor((val - 10) / 2);
const formatMod = (val: number) => (val >= 0 ? `+${val}` : `${val}`);

const SKILL_LIST = [
  { k: 'athletics', n: 'Athletics', a: 'str' }, { k: 'acrobatics', n: 'Acrobatics', a: 'dex' },
  { k: 'sleight', n: 'Sleight of Hand', a: 'dex' }, { k: 'stealth', n: 'Stealth', a: 'dex' },
  { k: 'history', n: 'History', a: 'int' }, { k: 'investigation', n: 'Investigation', a: 'int' },
  { k: 'tech', n: 'Technology', a: 'int' }, { k: 'programming', n: 'Programming', a: 'int' },
  { k: 'fund_science', n: 'Science', a: 'int' }, { k: 'weapons', n: 'Weaponry', a: 'int' },
  { k: 'nature', n: 'Nature', a: 'int' }, { k: 'religion', n: 'Religion', a: 'int' },
  { k: 'perception', n: 'Perception', a: 'wis' }, { k: 'survival', n: 'Survival', a: 'wis' },
  { k: 'medicine', n: 'Medicine', a: 'wis' }, { k: 'insight', n: 'Insight', a: 'wis' },
  { k: 'performance', n: 'Performance', a: 'cha' }, { k: 'intimidation', n: 'Intimidation', a: 'cha' },
  { k: 'deception', n: 'Deception', a: 'cha' }, { k: 'persuasion', n: 'Persuasion', a: 'cha' }
] as const;

const ATTRIBUTES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

type PanelType = 'identity' | 'biometrics' | 'skills' | 'equipment' | 'psych' | 'psionics' | 'universalis';

// Types for Drag State
interface DragState {
  active: boolean;
  listPathStr: string; 
  itemIndex: number;
  itemName: string;
  pos: { x: number; y: number };
}

// Local Component for Styling
const ResInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input 
        {...props} 
        className={`bg-[#051a05] border-b border-[#1a5c0b] text-[#38ff12] font-mono px-2 py-1 focus:border-[#38ff12] focus:outline-none focus:bg-[#0a2e0a] transition-colors w-full ${props.className || ''}`} 
    />
);

const ResTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
    <textarea 
        {...props} 
        className={`bg-[#051a05] border border-[#1a5c0b] text-[#38ff12] font-mono p-2 focus:border-[#38ff12] focus:outline-none resize-y min-h-[80px] w-full ${props.className || ''}`} 
    />
);

const ResSectionHeader: React.FC<{ title: string; onAdd?: () => void }> = ({ title, onAdd }) => (
    <h3 className="font-tech text-[#38ff12] text-lg uppercase tracking-widest border-b border-[#1a5c0b] pb-1 mb-4 flex justify-between items-center">
        {title}
        {onAdd && <button onClick={(e) => {e.stopPropagation(); onAdd();}} className="text-xs border border-[#1a5c0b] text-[#1a5c0b] px-2 hover:text-[#38ff12] hover:border-[#38ff12] transition-colors">[ ADD ]</button>}
    </h3>
);

const ResistanceDossier: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Character | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType>('identity');
  const [subTab, setSubTab] = useState<string>('default');
  const [now, setNow] = useState(new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Modal State
  const [editingItem, setEditingItem] = useState<{ path: string[], index: number, item: any } | null>(null);

  // Drag State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsub = OrdoService.subscribeOne(id, (char) => {
      if (char) setData(char);
      else alert("Protocol Terminated or Not Found");
    }, 'resistance');
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => { unsub(); clearInterval(timer); };
  }, [id]);

  const saveToDb = useMemo(() => debounce((newData: Character) => {
    if (!newData.id) return;
    OrdoService.update(newData.id, newData, 'resistance');
  }, 500), []);

  const update = useCallback((fn: (d: Character) => void) => {
    setData((prev) => {
      if (!prev) return null;
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);

  const switchPanel = (panel: PanelType) => {
      setActivePanel(panel);
      setSubTab('default');
      setIsMobileMenuOpen(false);
  };

  const addItem = (listPath: string[], item: any) => {
    update(d => {
      let target = d;
      for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i] as keyof Character] as any;
      const last = listPath[listPath.length - 1];
      if (Array.isArray((target as any)[last])) {
        (target as any)[last].push(item);
      }
    });
  };

  const removeItem = (listPath: string[], index: number) => {
    update(d => {
      let target = d;
      for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i] as keyof Character] as any;
      const last = listPath[listPath.length - 1];
      if (Array.isArray((target as any)[last])) {
        (target as any)[last].splice(index, 1);
      }
    });
  };

  const moveItemTo = (listPath: string[], fromIndex: number, toIndex: number) => {
      update(d => {
          let target = d;
          for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i] as keyof Character] as any;
          const arr = (target as any)[listPath[listPath.length - 1]];
          if(Array.isArray(arr) && fromIndex >= 0 && fromIndex < arr.length && toIndex >= 0 && toIndex < arr.length) {
              const [item] = arr.splice(fromIndex, 1);
              arr.splice(toIndex, 0, item);
          }
      });
  };

  const openEdit = (listPath: string[], index: number) => {
    let target = data;
    for (let i = 0; i < listPath.length; i++) target = (target as any)[listPath[i]];
    const item = (target as any)[index];
    setEditingItem({ path: listPath, index, item });
  };

  const updateClamped = (fieldPath: string[], value: number, max: number) => {
      update(d => {
          let target = d;
          for(let i=0; i<fieldPath.length-1; i++) target = (target as any)[fieldPath[i]];
          const last = fieldPath[fieldPath.length-1];
          (target as any)[last] = (max > 0 && value > max) ? max : value;
      });
  };

  // --- DRAG LOGIC ---
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, listPath: string[], index: number, itemName: string) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      dragTimerRef.current = setTimeout(() => {
          setDragState({
              active: true,
              listPathStr: JSON.stringify(listPath),
              itemIndex: index,
              itemName,
              pos: { x: clientX, y: clientY }
          });
      }, 500); 
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (dragTimerRef.current && !dragState) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
    }

    if (dragState && dragState.active) {
        e.preventDefault(); 
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
        
        setDragState(prev => prev ? ({ ...prev, pos: { x: clientX, y: clientY } }) : null);

        const elements = document.elementsFromPoint(clientX, clientY);
        for (const el of elements) {
            const listPathStr = el.getAttribute('data-list-path');
            const indexStr = el.getAttribute('data-index');
            
            if (listPathStr === dragState.listPathStr && indexStr) {
                const targetIndex = parseInt(indexStr);
                if (targetIndex !== dragState.itemIndex) {
                    const listPath = JSON.parse(listPathStr);
                    moveItemTo(listPath, dragState.itemIndex, targetIndex);
                    setDragState(prev => prev ? ({ ...prev, itemIndex: targetIndex }) : null);
                }
                break;
            }
        }
    }
  }, [dragState, update]);

  const handleDragEnd = useCallback(() => {
      if (dragTimerRef.current) {
          clearTimeout(dragTimerRef.current);
          dragTimerRef.current = null;
      }
      setDragState(null);
  }, []);

  useEffect(() => {
      window.addEventListener('mousemove', handleDragMove, { passive: false });
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchend', handleDragEnd);
      return () => {
          window.removeEventListener('mousemove', handleDragMove);
          window.removeEventListener('touchmove', handleDragMove);
          window.removeEventListener('mouseup', handleDragEnd);
          window.removeEventListener('touchend', handleDragEnd);
      }
  }, [handleDragMove, handleDragEnd]);


  if (!data) return <div className="text-[#38ff12] text-center mt-20 font-mono text-2xl animate-pulse">DECRYPTING PROTOCOL...</div>;

  const level = data.meta.level || 1;
  const pb = 2 + Math.floor((level - 1) / 4);
  const getAttrMod = (attr: keyof Attributes) => getMod(data.stats[attr] || 10);

  // Psionics/Tech Calcs
  const psiBaseAttr = data.psionics.base_attr;
  const psiMod = getMod(data.stats[psiBaseAttr]);
  const psiType = psiBaseAttr === 'int' ? 'learned' : 'intuitive';
  
  let rawClassLvl = 2 + Math.floor(data.meta.level / 3);
  let maxClassLvl = 8;
  if(data.psionics.caster_type === '0.5') maxClassLvl = 7;
  if(data.psionics.caster_type === '0.33') maxClassLvl = 6;
  const psiClassLvl = Math.max(2, Math.min(maxClassLvl, rawClassLvl));

  const cantripsKnown = pb;
  let spellsKnown = 0;
  if (psiType === 'learned') spellsKnown = level + psiMod;
  else spellsKnown = Math.floor(level / 2) + psiMod;
  if (spellsKnown < 1) spellsKnown = 1;

  let ptsPerLvl = 6;
  if(data.psionics.caster_type === '0.5') ptsPerLvl = 3;
  if(data.psionics.caster_type === '0.33') ptsPerLvl = 2;
  const psiMaxPts = (ptsPerLvl + (data.psionics.mod_points||0)) * level;

  const panels = (['identity', 'biometrics', 'skills', 'equipment', 'psych', 'psionics', 'universalis'] as PanelType[]);

  return (
    <div className="flex flex-col h-screen overflow-hidden relative bg-black font-mono text-[#38ff12] selection:bg-[#38ff12] selection:text-black">
      <style>{`
        .res-scroll::-webkit-scrollbar { width: 8px; }
        .res-scroll::-webkit-scrollbar-track { bg: #000; }
        .res-scroll::-webkit-scrollbar-thumb { background: #1a5c0b; border-radius: 2px; }
        .res-scroll::-webkit-scrollbar-thumb:hover { background: #38ff12; }
      `}</style>
      
      <ResistanceEditModal 
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="MODIFY DATA BLOCK"
        nameValue={editingItem?.item.name || ''}
        descValue={editingItem?.item.desc || ''}
        onNameChange={(v) => {
           if(editingItem) update(d => {
               let target: any = d;
               for(const p of editingItem.path) target = target[p];
               target[editingItem.index].name = v;
               setEditingItem({...editingItem, item: {...editingItem.item, name: v}});
           });
        }}
        onDescChange={(v) => {
            if(editingItem) update(d => {
                let target: any = d;
                for(const p of editingItem.path) target = target[p];
                target[editingItem.index].desc = v;
                setEditingItem({...editingItem, item: {...editingItem.item, desc: v}});
            });
         }}
      />

      {dragState && dragState.active && (
          <div 
            className="fixed pointer-events-none z-[100] bg-black border border-[#38ff12] p-2 text-[#38ff12] font-mono opacity-90"
            style={{ left: dragState.pos.x, top: dragState.pos.y }}
          >
              {dragState.itemName}
          </div>
      )}

      <header className="h-[60px] border-b border-[#1a5c0b] flex justify-between items-center px-4 relative z-50 shrink-0 bg-[#0a100a]">
        <div className="flex items-center">
          <Link to="/resistance/registry" className="border border-[#1a5c0b] text-[#1a5c0b] px-3 py-1 hover:border-[#38ff12] hover:text-[#38ff12] hover:bg-[#1a5c0b]/20 transition-all mr-4 text-xs font-bold">
             &lt;&lt; NODES
          </Link>
          <h1 className="text-xl font-tech tracking-widest text-[#38ff12] truncate uppercase">
             {data.meta.name || "UNKNOWN"}
          </h1>
        </div>
        <div className="flex items-center gap-4">
             <div className="hidden md:block text-xs text-[#1a5c0b] font-mono">
                UPTIME: {now.toISOString().split('T')[1].split('.')[0]}
             </div>
             <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden border border-[#38ff12] px-3 text-[#38ff12]">MENU</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-40">
        <aside className={`
            ${isMobileMenuOpen ? 'flex fixed inset-0 z-[60] bg-black/95' : 'hidden md:flex'}
            md:w-[250px] md:border-r border-[#1a5c0b]
            flex-col overflow-y-auto shrink-0 transition-all bg-[#050505]
        `}>
          {isMobileMenuOpen && <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-4 right-4 text-2xl text-[#38ff12]">X</button>}
          {panels.map(panel => (
              <button 
                key={panel}
                onClick={() => switchPanel(panel)}
                className={`text-left py-4 px-6 font-mono text-sm tracking-widest uppercase transition-all border-l-2 ${activePanel === panel ? 'text-black bg-[#38ff12] border-[#38ff12] font-bold' : 'text-[#1a5c0b] border-transparent hover:text-[#38ff12] hover:bg-[#1a5c0b]/10'}`}
              >
                 {panel}
              </button>
          ))}
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto res-scroll relative">
            <div className="max-w-5xl mx-auto pb-20">
                {activePanel === 'identity' && (
                    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
                        <div className="border border-[#1a5c0b] p-2 bg-[#0a100a]">
                             {data.meta.image ? <img src={data.meta.image} className="w-full h-auto grayscale sepia contrast-125" alt="Profile" /> : <div className="h-[300px] flex items-center justify-center text-[#1a5c0b] bg-black">NO VISUAL</div>}
                             <button onClick={() => { const url = prompt("IMG URL:"); if(url) update(d => d.meta.image = url); }} className="w-full mt-2 border border-[#1a5c0b] text-[#1a5c0b] hover:text-[#38ff12] text-xs py-1">UPLOAD NEW VISUAL</button>
                        </div>
                        <div className="space-y-4">
                             <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                 <ResSectionHeader title="BASIC DATA" />
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     {[{l:"Name", k:"name"}, {l:"Race", k:"race"}, {l:"Subrace", k:"subrace"}, {l:"Age", k:"age"}, {l:"Rank", k:"rank"}, {l:"Class", k:"class"}, {l:"Archetype", k:"archetype"}].map(f => (
                                         <div key={f.k}>
                                             <label className="text-[10px] text-[#1a5c0b] uppercase block mb-1">{f.l}</label>
                                             <ResInput value={(data.meta as any)[f.k]} onChange={e => update(d => (d.meta as any)[f.k] = e.target.value)} />
                                         </div>
                                     ))}
                                 </div>
                                 <div className="mt-4 flex items-center gap-4 border-t border-[#1a5c0b] pt-4">
                                     <div className="flex items-center gap-2">
                                         <span className="text-[#1a5c0b] text-xs">LEVEL:</span>
                                         <ResistanceNumberInput className="w-12 border-b border-[#38ff12] text-center" value={data.meta.level} onChange={e => update(d => d.meta.level = parseInt(e.target.value))} />
                                     </div>
                                     <div className="text-xs text-[#1a5c0b]">PROFICIENCY: <span className="text-[#38ff12] text-lg">+{pb}</span></div>
                                 </div>
                             </div>
                             <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                 <ResSectionHeader title="ADDITIONAL" />
                                 <div className="space-y-2">
                                     {[{l:"Job", k:"job"}, {l:"Clearance", k:"clearance"}, {l:"Comm", k:"comm"}].map(f => (
                                         <div key={f.k} className="flex gap-4 items-center">
                                             <span className="text-xs text-[#1a5c0b] w-20">{f.l}:</span>
                                             <ResInput value={(data.meta as any)[f.k]} onChange={e => update(d => (d.meta as any)[f.k] = e.target.value)} />
                                         </div>
                                     ))}
                                 </div>
                             </div>
                        </div>
                    </div>
                )}

                {activePanel === 'biometrics' && (
                    <div className="space-y-6">
                        <div className="border border-[#1a5c0b] p-4 bg-[#0a100a] grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                             <div>
                                 <div className="text-[#1a5c0b] text-xs mb-2">HIT POINTS (CURR / MAX)</div>
                                 <div className="flex justify-center gap-2 items-center">
                                     <ResistanceNumberInput className="text-3xl w-24 text-center border-b border-red-500 text-red-500" value={data.stats.hp_curr} onChange={e => updateClamped(['stats','hp_curr'], parseInt(e.target.value)||0, data.stats.hp_max)} />
                                     <span className="text-[#1a5c0b]">/</span>
                                     <ResistanceNumberInput className="text-3xl w-24 text-center border-b border-[#38ff12]" value={data.stats.hp_max} onChange={e => update(d => d.stats.hp_max = parseInt(e.target.value))} />
                                 </div>
                                 <div className="text-xs text-[#1a5c0b] mt-2">TEMP: <ResistanceNumberInput className="w-10 border-b border-[#1a5c0b] text-center" value={data.stats.hp_temp} onChange={e => update(d => d.stats.hp_temp = parseInt(e.target.value))} /></div>
                             </div>
                             <div>
                                 <div className="text-[#1a5c0b] text-xs mb-2">ARMOR CLASS</div>
                                 <ResistanceNumberInput className="text-5xl w-full text-center font-bold text-white block" value={data.stats.ac} onChange={e => update(d => d.stats.ac = parseInt(e.target.value))} />
                             </div>
                             <div>
                                 <div className="text-[#1a5c0b] text-xs mb-2">SHIELDS / SPEED</div>
                                 <div className="flex justify-center gap-4">
                                     <div>
                                         <div className="text-[10px] text-blue-500">SHIELD</div>
                                         <ResistanceNumberInput className="w-16 text-center border-b border-blue-500 text-blue-400 text-xl" value={data.stats.shield_curr} onChange={e => updateClamped(['stats','shield_curr'], parseInt(e.target.value)||0, data.stats.shield_max)} />
                                     </div>
                                     <div>
                                         <div className="text-[10px] text-white">SPEED</div>
                                         <ResistanceNumberInput className="w-16 text-center border-b border-white text-white text-xl" value={data.stats.speed} onChange={e => update(d => d.stats.speed = parseFloat(e.target.value))} />
                                     </div>
                                 </div>
                             </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                             {ATTRIBUTES.map(attr => (
                                 <div key={attr} className="border border-[#1a5c0b] bg-[#0a100a] p-2 text-center hover:border-[#38ff12] transition-colors">
                                     <div className="text-[#1a5c0b] text-xs uppercase font-bold">{attr}</div>
                                     <ResistanceNumberInput className="w-full text-center text-xl bg-transparent border-none text-white my-1" value={data.stats[attr]} onChange={e => update(d => d.stats[attr] = parseInt(e.target.value))} />
                                     <div className="text-[#38ff12] font-bold">{formatMod(getAttrMod(attr))}</div>
                                     <div className="mt-2 pt-2 border-t border-[#1a5c0b]/30 flex justify-between items-center px-2">
                                         <span className="text-[10px] text-[#1a5c0b]">SAVE</span>
                                         <ResistanceToggle checked={(data.saves as any)[`prof_${attr}`]} onChange={() => update(d => (d.saves as any)[`prof_${attr}`] = !(d.saves as any)[`prof_${attr}`])} />
                                     </div>
                                 </div>
                             ))}
                        </div>
                    </div>
                )}

                {activePanel === 'skills' && (
                    <div className="space-y-6">
                        <div className="flex gap-4 overflow-x-auto pb-2 border-b border-[#1a5c0b]">
                            {['Skills', 'Abilities', 'Traits', 'Features', 'Profs'].map(t => (
                                <button key={t} onClick={() => setSubTab(t)} className={`uppercase text-sm px-3 py-1 ${subTab === t ? 'bg-[#38ff12] text-black font-bold' : 'text-[#1a5c0b] hover:text-[#38ff12]'}`}>{t}</button>
                            ))}
                        </div>
                        
                        {(subTab === 'default' || subTab === 'Skills') && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {SKILL_LIST.map(skill => {
                                    const [isProf, isExp, bonus] = data.skills.data[skill.k] || [false, false, 0];
                                    const attrMod = getAttrMod(skill.a as any);
                                    let total = attrMod + bonus;
                                    if (isExp) total += pb * 2;
                                    else if (isProf) total += pb;
                                    return (
                                        <div key={skill.k} className="flex justify-between items-center border border-[#1a5c0b] p-2 bg-[#050a05] hover:border-[#38ff12] transition-colors">
                                            <div>
                                                <div className="text-sm text-[#38ff12]">{skill.n}</div>
                                                <div className="text-[10px] text-[#1a5c0b] uppercase">{skill.a}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex flex-col items-center">
                                                     <span className="text-[8px] text-[#1a5c0b]">PROF</span>
                                                     <ResistanceToggle checked={isProf} onChange={() => update(d => { const c = d.skills.data[skill.k] || [false,false,0]; d.skills.data[skill.k] = [!c[0], c[1], c[2]]; })} />
                                                </div>
                                                <div className="flex flex-col items-center">
                                                     <span className="text-[8px] text-[#1a5c0b]">EXP</span>
                                                     <ResistanceToggle className="border-yellow-600 checked:bg-yellow-500 checked:shadow-[0_0_5px_yellow]" checked={isExp} onChange={() => update(d => { const c = d.skills.data[skill.k] || [false,false,0]; d.skills.data[skill.k] = [c[0], !c[1], c[2]]; })} />
                                                </div>
                                                <ResistanceNumberInput className="w-8 text-center text-xs border-b border-[#1a5c0b]" value={bonus} onChange={e => update(d => { const c = d.skills.data[skill.k] || [false,false,0]; d.skills.data[skill.k] = [c[0], c[1], parseInt(e.target.value)||0]; })} />
                                                <div className="w-8 text-right font-bold text-white">{formatMod(total)}</div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {['Abilities','Traits','Features'].includes(subTab) && (
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                <ResSectionHeader title={subTab} onAdd={() => addItem([subTab.toLowerCase()], {name: 'New Entry'})} />
                                {(data as any)[subTab.toLowerCase()].map((item: any, i: number) => {
                                    const path = [subTab.toLowerCase()];
                                    return (
                                    <div key={i} className={`flex justify-between p-2 border-b border-[#1a5c0b]/30 hover:bg-[#1a5c0b]/10 ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(path) ? 'opacity-30' : 'opacity-100'}`} data-list-path={JSON.stringify(path)} data-index={i}>
                                        <div className="cursor-pointer text-[#38ff12] w-full" onClick={() => openEdit(path, i)}>{item.name}</div>
                                        <div className="flex items-center">
                                            <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, path, i, item.name)} onTouchStart={(e) => handleDragStart(e, path, i, item.name)} />
                                            <ResistanceDeleteBtn onClick={() => removeItem(path, i)} />
                                        </div>
                                    </div>
                                )})}
                            </div>
                        )}
                         {subTab === 'Profs' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {['armory', 'tools', 'langs'].map(k => (
                                    <div key={k} className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                        <ResSectionHeader title={k} onAdd={() => addItem(['profs', k], "New")} />
                                        {(data.profs as any)[k].map((it:string, i:number) => (
                                            <div key={i} className="flex justify-between items-center mb-1" data-list-path={JSON.stringify(['profs', k])} data-index={i}>
                                                <ResInput value={it} onChange={(e) => update(d => (d.profs as any)[k][i] = e.target.value)} />
                                                <div className="flex">
                                                    <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['profs', k], i, it)} onTouchStart={(e) => handleDragStart(e, ['profs', k], i, it)} />
                                                    <ResistanceDeleteBtn onClick={() => removeItem(['profs', k], i)} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {activePanel === 'equipment' && (
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="WEAPONS" onAdd={() => addItem(['combat', 'weapons'], {name: 'Weapon', type: 'Type'})} />
                             {data.combat.weapons.map((w, i) => (
                                 <div key={i} className={`mb-2 p-2 border border-[#1a5c0b]/50 hover:border-[#38ff12] ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['combat', 'weapons']) ? 'opacity-30' : 'opacity-100'}`} data-list-path={JSON.stringify(['combat', 'weapons'])} data-index={i} onClick={() => openEdit(['combat', 'weapons'], i)}>
                                     <div className="flex justify-between items-center">
                                         <span className="font-bold text-[#38ff12]">{w.name}</span>
                                         <div className="flex" onClick={e => e.stopPropagation()}>
                                             <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['combat', 'weapons'], i, w.name)} onTouchStart={(e) => handleDragStart(e, ['combat', 'weapons'], i, w.name)} />
                                             <ResistanceDeleteBtn onClick={() => removeItem(['combat', 'weapons'], i)} />
                                         </div>
                                     </div>
                                     <ResInput className="text-xs text-[#1a5c0b] border-none bg-transparent px-0" value={w.type} onClick={e => e.stopPropagation()} onChange={e => update(d => d.combat.weapons[i].type = e.target.value)} />
                                 </div>
                             ))}
                         </div>
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="INVENTORY" onAdd={() => addItem(['combat', 'inventory'], {name: 'Item'})} />
                             {data.combat.inventory.map((w, i) => (
                                 <div key={i} className={`flex justify-between items-center mb-1 p-1 hover:bg-[#1a5c0b]/10 ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['combat', 'inventory']) ? 'opacity-30' : 'opacity-100'}`} data-list-path={JSON.stringify(['combat', 'inventory'])} data-index={i} onClick={() => openEdit(['combat', 'inventory'], i)}>
                                     <span className="text-sm text-gray-300 cursor-pointer">{w.name}</span>
                                     <div className="flex" onClick={e => e.stopPropagation()}>
                                         <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['combat', 'inventory'], i, w.name)} onTouchStart={(e) => handleDragStart(e, ['combat', 'inventory'], i, w.name)} />
                                         <ResistanceDeleteBtn onClick={() => removeItem(['combat', 'inventory'], i)} />
                                     </div>
                                 </div>
                             ))}
                         </div>
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="CREDITS" />
                             <div className="flex justify-between gap-4">
                                 {['u','k','m','g'].map(c => (
                                     <div key={c} className="text-center">
                                         <label className="text-xs text-[#1a5c0b] uppercase">{c}</label>
                                         <ResistanceNumberInput className="w-full text-center border-b border-[#38ff12]" value={(data.money as any)[c]} onChange={e => update(d => (d.money as any)[c] = e.target.value)} />
                                     </div>
                                 ))}
                             </div>
                         </div>
                     </div>
                )}

                {activePanel === 'psych' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="METRICS" />
                             {['size', 'age', 'height', 'weight'].map(k => (
                                 <div key={k} className="flex justify-between mb-2">
                                     <span className="text-[#1a5c0b] uppercase text-sm">{k}:</span>
                                     <ResInput className="w-1/2 text-right" value={(data.psych as any)[k]} onChange={e => update(d => (d.psych as any)[k] = e.target.value)} />
                                 </div>
                             ))}
                         </div>
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="PROFILE" />
                             {['trait', 'ideal', 'bond', 'flaw'].map(k => (
                                 <div key={k} className="mb-2">
                                     <span className="text-[#1a5c0b] uppercase text-xs">{k}:</span>
                                     <ResTextarea className="h-16 text-xs" value={(data.psych as any)[k]} onChange={e => update(d => (d.psych as any)[k] = e.target.value)} />
                                 </div>
                             ))}
                         </div>
                         <div className="md:col-span-2 border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="PSYCH EVAL" />
                             <ResTextarea className="h-32" value={data.psych.analysis} onChange={e => update(d => d.psych.analysis = e.target.value)} />
                         </div>
                     </div>
                )}
                
                {activePanel === 'psionics' && (
                    <div className="space-y-6">
                        <div className="flex gap-4 border-b border-[#1a5c0b] pb-2">
                            <button onClick={() => setSubTab('default')} className={`px-4 py-1 text-sm ${subTab === 'default' ? 'bg-[#38ff12] text-black' : 'text-[#38ff12]'}`}>CONFIG</button>
                            <button onClick={() => setSubTab('spells')} className={`px-4 py-1 text-sm ${subTab === 'spells' ? 'bg-[#38ff12] text-black' : 'text-[#38ff12]'}`}>SPELLS</button>
                        </div>
                        
                        {subTab === 'default' && (
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                 <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                     <ResSectionHeader title="PSI CONFIG" />
                                     <div className="space-y-4">
                                         <div className="flex justify-between"><span>BASE ATTR:</span> <select className="bg-black text-[#38ff12] border border-[#1a5c0b]" value={data.psionics.base_attr} onChange={e => update(d => d.psionics.base_attr = e.target.value as any)}><option value="int">INT</option><option value="wis">WIS</option><option value="cha">CHA</option></select></div>
                                         <div className="flex justify-between"><span>TYPE:</span> <select className="bg-black text-[#38ff12] border border-[#1a5c0b]" value={data.psionics.caster_type} onChange={e => update(d => d.psionics.caster_type = e.target.value as any)}><option value="1">FULL</option><option value="0.5">HALF</option><option value="0.33">THIRD</option></select></div>
                                         <div className="flex justify-between"><span>CLASS LVL:</span> <span className="text-white font-bold">{psiClassLvl}</span></div>
                                         <div className="flex justify-between"><span>POINT MOD:</span> <ResistanceNumberInput className="w-12 text-center border-b border-[#38ff12]" value={data.psionics.mod_points} onChange={e => update(d => d.psionics.mod_points = parseInt(e.target.value))} /></div>
                                     </div>
                                 </div>
                                 <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                     <ResSectionHeader title="OUTPUT" />
                                     <div className="space-y-2 text-sm">
                                         <div className="flex justify-between"><span>DC:</span> <span className="text-xl text-white font-bold">{8 + pb + psiMod + (psiClassLvl - 2)}</span></div>
                                         <div className="flex justify-between"><span>CANTRIPS:</span> <span>{cantripsKnown}</span></div>
                                         <div className="flex justify-between"><span>SPELLS KNOWN:</span> <span>{spellsKnown}</span></div>
                                         <div className="mt-4">
                                             <div className="flex justify-between mb-1"><span>PSI POINTS:</span> <span>{data.psionics.points_curr} / {psiMaxPts}</span></div>
                                             <div className="w-full bg-[#1a5c0b] h-2">
                                                 <div className="bg-[#38ff12] h-full" style={{width: `${Math.min(100, (data.psionics.points_curr/psiMaxPts)*100)}%`}}></div>
                                             </div>
                                             <div className="flex justify-center mt-2">
                                                 <button className="border border-[#1a5c0b] px-2 mr-2" onClick={() => updateClamped(['psionics','points_curr'], data.psionics.points_curr - 1, psiMaxPts)}>-</button>
                                                 <button className="border border-[#1a5c0b] px-2" onClick={() => updateClamped(['psionics','points_curr'], data.psionics.points_curr + 1, psiMaxPts)}>+</button>
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                        )}
                        {subTab === 'spells' && (
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                <ResSectionHeader title="SPELL MATRIX" onAdd={() => addItem(['psionics', 'spells'], {name: 'New Spell', time: '1a', range: '60ft', cost: 1, dur: 'Inst'})} />
                                <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="text-[#1a5c0b] text-xs border-b border-[#1a5c0b]"><tr><th>NAME</th><th>TIME</th><th>RANGE</th><th>CONC</th><th>DUR</th><th>COST</th><th>ACT</th></tr></thead>
                                    <tbody>
                                        {data.psionics.spells.map((s, i) => (
                                            <tr key={i} className={`border-b border-[#1a5c0b]/20 hover:bg-[#1a5c0b]/10 ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['psionics', 'spells']) ? 'opacity-30' : 'opacity-100'}`} data-list-path={JSON.stringify(['psionics', 'spells'])} data-index={i}>
                                                <td className="p-2 cursor-pointer text-[#38ff12]" onClick={() => openEdit(['psionics', 'spells'], i)}>{s.name}</td>
                                                <td><input className="bg-transparent w-10 text-[#1a5c0b]" value={s.time} onChange={e => update(d => d.psionics.spells[i].time = e.target.value)} /></td>
                                                <td><input className="bg-transparent w-10 text-[#1a5c0b]" value={s.range} onChange={e => update(d => d.psionics.spells[i].range = e.target.value)} /></td>
                                                <td><input type="checkbox" checked={s.conc} onChange={e => update(d => d.psionics.spells[i].conc = e.target.checked)} /></td>
                                                <td><input className="bg-transparent w-16 text-[#1a5c0b]" value={s.dur} onChange={e => update(d => d.psionics.spells[i].dur = e.target.value)} /></td>
                                                <td><ResistanceNumberInput className="w-8 text-white font-bold" value={s.cost} onChange={e => update(d => d.psionics.spells[i].cost = parseInt(e.target.value))} /></td>
                                                <td>
                                                    <div className="flex">
                                                        <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['psionics', 'spells'], i, s.name)} onTouchStart={(e) => handleDragStart(e, ['psionics', 'spells'], i, s.name)} />
                                                        <ResistanceDeleteBtn onClick={() => removeItem(['psionics', 'spells'], i)} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                {activePanel === 'universalis' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="UNIVERSAL SAVE" />
                             <div className="flex flex-col gap-4">
                                 <div className="flex justify-between items-center">
                                     <span>BASE:</span>
                                     <ResistanceNumberInput className="w-16 border-b border-[#38ff12] text-center" value={data.universalis.save_base} onChange={e => update(d => d.universalis.save_base = parseInt(e.target.value))} />
                                 </div>
                                 <div className="flex justify-between items-center">
                                     <span>ATTR:</span>
                                     <select className="bg-black text-[#38ff12] border border-[#1a5c0b]" value={data.universalis.save_attr} onChange={e => update(d => d.universalis.save_attr = e.target.value as any)}>
                                         {ATTRIBUTES.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                                     </select>
                                 </div>
                                 <div className="text-center border-t border-[#1a5c0b] pt-4">
                                     <div className="text-[#1a5c0b] text-xs">TOTAL DC</div>
                                     <div className="text-4xl text-white font-bold">{data.universalis.save_base + getMod(data.stats[data.universalis.save_attr]) + pb}</div>
                                 </div>
                             </div>
                         </div>
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="CUSTOM REGISTRY" onAdd={() => addItem(['universalis', 'custom_table'], {name: 'Entry'})} />
                             <button onClick={() => addItem(['universalis', 'custom_table'], {name: '---', isHeader: true})} className="mb-2 text-xs border border-[#1a5c0b] px-2 w-full text-center hover:bg-[#1a5c0b] hover:text-white">+ HEADER</button>
                             {data.universalis.custom_table.map((it, i) => (
                                 <div key={i} className={`flex justify-between items-center p-1 ${it.isHeader ? 'mt-2 border-b border-[#38ff12]' : 'border-b border-[#1a5c0b]/20'} ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['universalis', 'custom_table']) ? 'opacity-30' : 'opacity-100'}`} data-list-path={JSON.stringify(['universalis', 'custom_table'])} data-index={i}>
                                     <ResInput className={`bg-transparent border-none px-0 ${it.isHeader ? 'font-bold text-center' : ''}`} value={it.name} onChange={e => update(d => d.universalis.custom_table[i].name = e.target.value)} />
                                     <div className="flex items-center">
                                         {!it.isHeader && <button onClick={() => openEdit(['universalis', 'custom_table'], i)} className="mr-1 text-[#1a5c0b] text-xs">[E]</button>}
                                         <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['universalis', 'custom_table'], i, it.name)} onTouchStart={(e) => handleDragStart(e, ['universalis', 'custom_table'], i, it.name)} />
                                         <ResistanceDeleteBtn onClick={() => removeItem(['universalis', 'custom_table'], i)} />
                                     </div>
                                 </div>
                             ))}
                         </div>
                         <div className="md:col-span-2 border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <ResSectionHeader title="COUNTERS" onAdd={() => addItem(['universalis', 'counters'], {name: 'Count', val: 0, max: 5})} />
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                 {data.universalis.counters.map((c, i) => (
                                     <div key={i} className={`border border-[#1a5c0b] p-2 bg-black ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['universalis', 'counters']) ? 'opacity-30' : 'opacity-100'}`} data-list-path={JSON.stringify(['universalis', 'counters'])} data-index={i}>
                                         <div className="flex justify-between mb-2">
                                              <ResInput className="text-xs bg-transparent border-none px-0" value={c.name} onChange={e => update(d => d.universalis.counters[i].name = e.target.value)} />
                                              <div className="flex">
                                                 <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['universalis', 'counters'], i, c.name)} onTouchStart={(e) => handleDragStart(e, ['universalis', 'counters'], i, c.name)} />
                                                 <ResistanceDeleteBtn onClick={() => removeItem(['universalis', 'counters'], i)} />
                                              </div>
                                         </div>
                                         <div className="flex items-center justify-center gap-2">
                                             <ResistanceNumberInput className="w-10 text-center font-bold text-white border-none" value={c.val} onChange={e => updateClamped(['universalis','counters', i.toString(), 'val'], parseInt(e.target.value)||0, c.max)} />
                                             <span>/</span>
                                             <ResistanceNumberInput className="w-10 text-center text-[#1a5c0b] border-none" value={c.max} onChange={e => update(d => d.universalis.counters[i].max = parseInt(e.target.value))} />
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         </div>
                     </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default ResistanceDossier;
