
import React, { useRef, useState } from 'react';

// --- STYLES ---
const noSpinnerStyle = `
  .no-spinner::-webkit-inner-spin-button, 
  .no-spinner::-webkit-outer-spin-button { 
    -webkit-appearance: none; 
    margin: 0; 
  }
  .no-spinner { 
    -moz-appearance: textfield; 
  }
`;

// --- EMPIRE COMPONENTS ---

export const ImperialInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`bg-transparent border-0 border-b border-dashed border-ordo-gold-dim text-right text-gray-200 font-header font-bold text-base px-2 py-0.5 w-full focus:ring-0 focus:border-ordo-gold focus:bg-[rgba(212,175,55,0.05)] transition-all outline-none ${props.className || ''}`}
  />
);

export const ImperialTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea
    {...props}
    className={`bg-[rgba(0,0,0,0.2)] border border-ordo-gold-dim text-gray-200 font-body text-lg w-full p-2 resize-y min-h-[80px] focus:border-ordo-gold outline-none ${props.className || ''}`}
  />
);

export const EmpireNumberInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, onChange, value, ...props }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const triggerChange = (newValue: number) => {
    if (onChange) {
      // Create a synthetic event
      const syntheticEvent = {
        target: { value: newValue.toString(), name: props.name },
        currentTarget: { value: newValue.toString(), name: props.name }
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const step = Number(props.step) || 1;

  const handleInc = (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = Number(value) || 0;
    triggerChange(current + step);
  };

  const handleDec = (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = Number(value) || 0;
    triggerChange(current - step);
  };

  return (
    <div className={`relative inline-block group ${className || ''}`}>
      <style>{noSpinnerStyle}</style>
      <input
        {...props}
        ref={inputRef}
        type="number"
        value={value}
        onChange={onChange}
        className={`w-full h-full bg-transparent text-center font-header font-bold text-gray-200 outline-none border-b border-transparent focus:border-ordo-gold no-spinner pr-4 transition-colors`}
      />
      {/* Custom Spinners */}
      <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center opacity-30 group-hover:opacity-100 transition-opacity w-4">
        <button 
          type="button"
          onClick={handleInc} 
          className="h-1/2 flex items-center justify-center text-ordo-gold hover:text-white cursor-pointer select-none leading-none text-[8px]"
          tabIndex={-1}
        >
          ▲
        </button>
        <button 
          type="button"
          onClick={handleDec} 
          className="h-1/2 flex items-center justify-center text-ordo-gold hover:text-white cursor-pointer select-none leading-none text-[8px]"
          tabIndex={-1}
        >
          ▼
        </button>
      </div>
    </div>
  );
};

export const StatBox: React.FC<{ label: string; value: number | string; modifier?: string; children?: React.ReactNode }> = ({ label, value, modifier, children }) => (
  <div className="text-center border border-[rgba(212,175,55,0.1)] p-2 md:p-4 transition-colors hover:bg-[rgba(212,175,55,0.05)] hover:border-ordo-gold group">
    <h3 className="text-ordo-gold-dim text-xs md:text-sm uppercase m-0">{label}</h3>
    {children ? children : (
      <>
        <span className="font-header text-2xl md:text-3xl text-gray-200 block my-1">{value}</span>
        {modifier && <div className="text-ordo-crimson font-bold">{modifier}</div>}
      </>
    )}
  </div>
);

export const SectionHeader: React.FC<{ title: string; onAdd?: () => void }> = ({ title, onAdd }) => (
  <h2 className="font-header text-gray-200 text-base md:text-lg mb-4 uppercase tracking-wider border-b-2 border-ordo-crimson inline-block pr-5 max-w-full truncate">
    {title}
    {onAdd && (
      <button 
        onClick={(e) => { e.stopPropagation(); onAdd(); }} 
        className="ml-3 text-sm bg-transparent border border-ordo-gold-dim text-ordo-gold px-2 py-0.5 hover:bg-ordo-gold hover:text-black transition-colors"
      >
        [+]
      </button>
    )}
  </h2>
);

export const DataBlock: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-[rgba(20,16,16,0.8)] md:bg-[rgba(20,16,16,0.6)] border border-ordo-gold-dim p-4 md:p-6 relative shadow-lg hover:-translate-y-0.5 hover:shadow-[0_5px_25px_rgba(212,175,55,0.1)] hover:border-ordo-gold transition-all duration-300 ${className || ''}`}>
    {children}
  </div>
);

export const DeleteBtn: React.FC<{ onClick: (e: React.MouseEvent) => void }> = ({ onClick }) => (
  <button 
    onClick={onClick}
    className="bg-transparent border-0 text-ordo-gold-dim font-bold font-header ml-2 hover:text-ordo-crimson transition-colors px-2 py-1"
  >
    [x]
  </button>
);

export const DragHandle: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => (
  <div 
    {...props}
    className="cursor-grab active:cursor-grabbing px-2 py-1 text-ordo-gold-dim hover:text-ordo-gold transition-colors select-none touch-none flex items-center justify-center"
    title="Hold to drag"
  >
    <svg width="12" height="20" viewBox="0 0 10 16" fill="currentColor" className="opacity-50 hover:opacity-100">
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="8" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" />
      <circle cx="8" cy="14" r="1.5" />
    </svg>
  </div>
);

export const EmpireImageModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [tab, setTab] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setError('');
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 800 * 1024) { // 800KB limit warning
              setError("WARNING: File size large. Codex capacity limited.");
          }
          const reader = new FileReader();
          reader.onloadend = () => {
              onConfirm(reader.result as string);
              onClose();
          };
          reader.readAsDataURL(file);
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
      <div className="bg-[#100c0c] border-2 border-ordo-gold p-1 w-full max-w-[500px] shadow-[0_0_40px_rgba(212,175,55,0.2)]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[radial-gradient(circle_at_center,#2a2020_0%,#000_100%)] border-b border-ordo-gold p-4 flex justify-between items-center mb-6">
            <span className="font-header font-bold text-ordo-gold tracking-[3px] uppercase text-lg drop-shadow-[0_0_5px_rgba(212,175,55,0.5)]">VISUAL DATA INPUT</span>
            <button onClick={onClose} className="text-ordo-gold hover:text-white font-header text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 pb-6">
            {/* Tabs */}
            <div className="flex mb-8 border-b border-ordo-gold-dim/30">
                <button 
                    onClick={() => setTab('url')} 
                    className={`flex-1 py-3 font-header tracking-wider transition-all duration-300 ${tab === 'url' ? 'text-ordo-gold bg-[rgba(212,175,55,0.1)] border-t border-l border-r border-ordo-gold' : 'text-ordo-gold-dim hover:text-ordo-gold hover:bg-[rgba(212,175,55,0.05)]'}`}
                >
                    DATA LINK
                </button>
                <button 
                    onClick={() => setTab('file')} 
                    className={`flex-1 py-3 font-header tracking-wider transition-all duration-300 ${tab === 'file' ? 'text-ordo-gold bg-[rgba(212,175,55,0.1)] border-t border-l border-r border-ordo-gold' : 'text-ordo-gold-dim hover:text-ordo-gold hover:bg-[rgba(212,175,55,0.05)]'}`}
                >
                    LOCAL UPLOAD
                </button>
            </div>

            {/* Content */}
            <div className="min-h-[150px] flex flex-col justify-center">
                {tab === 'url' ? (
                     <div className="w-full">
                        <label className="block text-ordo-gold-dim text-xs mb-3 font-header tracking-[2px] uppercase">External Resource Identifier</label>
                        <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ordo-gold-dim font-mono text-xs">URL:</span>
                            <input 
                                autoFocus
                                type="text" 
                                className="w-full bg-[rgba(0,0,0,0.3)] border-b border-ordo-gold text-white font-mono text-sm pl-12 pr-2 py-3 focus:outline-none focus:border-ordo-crimson focus:bg-[rgba(212,175,55,0.05)] transition-colors placeholder-gray-700"
                                placeholder="HTTPS://..."
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && url.trim()) {
                                        onConfirm(url);
                                        onClose();
                                    }
                                }}
                            />
                        </div>
                     </div>
                ) : (
                    <div className="border-2 border-dashed border-ordo-gold-dim p-8 text-center relative hover:bg-[rgba(212,175,55,0.05)] hover:border-ordo-gold transition-all cursor-pointer group bg-[rgba(0,0,0,0.3)]">
                        <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                        <div className="text-ordo-gold text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                            <i className="fa-solid fa-file-arrow-up"></i>
                        </div>
                        <div className="text-ordo-gold font-header tracking-widest text-sm group-hover:text-white transition-colors">INITIATE UPLOAD SEQUENCE</div>
                        <div className="text-ordo-gold-dim text-xs mt-3 font-mono">SUPPORTED FORMATS: JPG, PNG, WEBP</div>
                        {error && <div className="text-ordo-crimson text-xs mt-2 font-bold animate-pulse font-mono border border-ordo-crimson/30 bg-ordo-crimson/10 p-1">{error}</div>}
                    </div>
                )}
            </div>

            {/* Footer / Action */}
            {tab === 'url' && (
                <button 
                    onClick={() => {
                        if (url.trim()) {
                            onConfirm(url);
                            onClose();
                        }
                    }} 
                    className="mt-6 w-full bg-transparent border border-ordo-gold text-ordo-gold py-3 hover:bg-ordo-gold hover:text-black font-header font-bold uppercase transition-all tracking-[2px] shadow-[0_0_15px_rgba(212,175,55,0.1)] hover:shadow-[0_0_25px_rgba(212,175,55,0.4)]"
                >
                    ESTABLISH LINK
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

// --- RESISTANCE COMPONENTS ---

export const ResistanceNumberInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, onChange, value, ...props }) => {
    const inputRef = useRef<HTMLInputElement>(null);
  
    const triggerChange = (newValue: number) => {
      if (onChange) {
        const syntheticEvent = {
          target: { value: newValue.toString(), name: props.name },
          currentTarget: { value: newValue.toString(), name: props.name }
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    };
  
    const step = Number(props.step) || 1;
  
    const handleInc = (e: React.MouseEvent) => {
      e.stopPropagation();
      const current = Number(value) || 0;
      triggerChange(current + step);
    };
  
    const handleDec = (e: React.MouseEvent) => {
      e.stopPropagation();
      const current = Number(value) || 0;
      triggerChange(current - step);
    };
  
    return (
      <div className={`relative inline-block group ${className || ''}`}>
        <style>{noSpinnerStyle}</style>
        <input
          {...props}
          ref={inputRef}
          type="number"
          value={value}
          onChange={onChange}
          className={`w-full h-full bg-transparent text-center font-mono outline-none no-spinner border-b border-transparent focus:border-[#38ff12] transition-colors pr-5`}
        />
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center opacity-40 group-hover:opacity-100 transition-opacity w-5 bg-black/20">
          <button 
            type="button"
            onClick={handleInc} 
            className="h-1/2 flex items-center justify-center text-[#1a5c0b] hover:text-[#38ff12] cursor-pointer select-none border-b border-[#1a5c0b]/20"
            tabIndex={-1}
          >
            <span className="text-[10px] transform -translate-y-[1px]">▲</span>
          </button>
          <button 
            type="button"
            onClick={handleDec} 
            className="h-1/2 flex items-center justify-center text-[#1a5c0b] hover:text-[#38ff12] cursor-pointer select-none"
            tabIndex={-1}
          >
             <span className="text-[10px] transform translate-y-[1px]">▼</span>
          </button>
        </div>
      </div>
    );
  };

export const ResistanceToggle: React.FC<{ checked: boolean; onChange: () => void; className?: string }> = ({ checked, onChange, className }) => (
  <div 
    onClick={(e) => { e.stopPropagation(); onChange(); }}
    className={`w-4 h-4 border border-[#1a5c0b] cursor-pointer flex items-center justify-center transition-all ${checked ? 'bg-[#38ff12] shadow-[0_0_5px_#38ff12]' : 'bg-transparent'} ${className || ''}`}
  >
    {checked && <div className="w-2 h-2 bg-[#050505]" />}
  </div>
);

export const ResistanceDeleteBtn: React.FC<{ onClick: (e: React.MouseEvent) => void }> = ({ onClick }) => (
  <button 
    onClick={onClick}
    className="ml-2 text-[#1a5c0b] hover:text-[#ff3333] transition-colors font-mono font-bold px-2 border border-transparent hover:border-[#ff3333] hover:bg-[#ff3333]/10"
    title="TERMINATE"
  >
    X
  </button>
);

export const ResistanceDragHandle: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => (
  <div 
    {...props}
    className="cursor-grab active:cursor-grabbing px-2 text-[#1a5c0b] hover:text-[#38ff12] transition-colors select-none touch-none flex items-center justify-center gap-[2px]"
    title="REORDER"
  >
     <div className="w-[2px] h-4 bg-current opacity-50"></div>
     <div className="w-[2px] h-4 bg-current opacity-50"></div>
     <div className="w-[2px] h-4 bg-current opacity-50"></div>
  </div>
);

// --- MODALS ---

export const EditModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string;
  nameValue: string;
  descValue: string;
  onNameChange: (v: string) => void;
  onDescChange: (v: string) => void;
}> = ({ isOpen, onClose, title, nameValue, descValue, onNameChange, onDescChange }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#100c0c] border-2 border-ordo-gold p-4 md:p-8 w-full max-w-[600px] shadow-[0_0_50px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 border-b border-ordo-gold-dim pb-2">
          <h2 className="font-header text-xl md:text-2xl text-ordo-gold tracking-widest uppercase truncate pr-4">{title}</h2>
          <button onClick={onClose} className="text-ordo-crimson text-3xl hover:text-white transition-colors leading-none">&times;</button>
        </div>
        
        <div className="mb-6">
          <label className="block text-ordo-gold-dim text-sm mb-2 font-header">НАЗВАНИЕ</label>
          <input 
            type="text" 
            value={nameValue} 
            onChange={e => onNameChange(e.target.value)}
            className="w-full bg-transparent border-b-2 border-ordo-gold text-xl md:text-2xl font-header text-white focus:outline-none focus:border-white transition-colors text-center pb-2"
          />
        </div>

        <div>
          <label className="block text-ordo-gold-dim text-sm mb-2 font-header">ОПИСАНИЕ</label>
          <textarea 
            value={descValue} 
            onChange={e => onDescChange(e.target.value)}
            className="w-full h-40 bg-[rgba(0,0,0,0.3)] border border-ordo-gold-dim p-4 text-gray-200 font-body text-base md:text-lg focus:border-ordo-gold focus:outline-none resize-none"
          />
        </div>
        
        <button onClick={onClose} className="mt-4 w-full border border-ordo-gold text-ordo-gold py-2 hover:bg-ordo-gold hover:text-black transition-colors font-header">
          СОХРАНИТЬ И ЗАКРЫТЬ
        </button>
      </div>
    </div>
  );
};

export const InputModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (val: string) => void;
  title: string;
  placeholder?: string;
}> = ({ isOpen, onClose, onConfirm, title, placeholder }) => {
  const [val, setVal] = React.useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
      <div className="bg-[#100c0c] border-2 border-ordo-gold p-8 w-full max-w-[500px] shadow-[0_0_40px_rgba(212,175,55,0.2)]" onClick={e => e.stopPropagation()}>
        <h2 className="font-header text-2xl text-ordo-gold tracking-widest uppercase text-center mb-8 border-b border-ordo-gold-dim pb-4">{title}</h2>
        
        <input 
          type="text" 
          value={val} 
          placeholder={placeholder}
          autoFocus
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && val.trim()) {
              onConfirm(val);
              setVal('');
            }
          }}
          className="w-full bg-transparent border-b-2 border-ordo-gold text-2xl font-header text-white focus:outline-none focus:border-ordo-crimson transition-colors text-center pb-2 mb-8 placeholder-gray-700"
        />
        
        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 border border-ordo-gold-dim text-ordo-gold-dim py-3 hover:text-white hover:border-white transition-colors font-header">
            ОТМЕНА
          </button>
          <button 
            onClick={() => {
              if (val.trim()) {
                onConfirm(val);
                setVal('');
              }
            }} 
            className="flex-1 bg-ordo-gold text-black border border-ordo-gold py-3 hover:bg-white transition-colors font-header font-bold disabled:opacity-50"
            disabled={!val.trim()}
          >
            ПОДТВЕРДИТЬ
          </button>
        </div>
      </div>
    </div>
  );
};

export const ResistanceInputModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (val: string) => void;
  title: string;
  placeholder?: string;
}> = ({ isOpen, onClose, onConfirm, title, placeholder }) => {
  const [val, setVal] = React.useState('');
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
        <div className="bg-[#0a0a0a] border-2 border-[#38ff12] p-1 w-full max-w-[500px] shadow-[0_0_30px_rgba(56,255,18,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1a5c0b] p-2 flex justify-between items-center border-b border-[#38ff12] mb-6">
                <span className="font-bold text-white font-tech tracking-widest">{title}</span>
                <button onClick={onClose} className="text-[#38ff12] hover:text-white px-2 font-mono">X</button>
            </div>
            
            <div className="px-6 pb-6 flex flex-col gap-6">
                <input 
                    autoFocus
                    type="text" 
                    className="bg-[#051a05] border border-[#38ff12] p-4 text-[#38ff12] font-mono text-xl outline-none focus:bg-[#0a2e0a] text-center placeholder-[#1a5c0b]"
                    placeholder={placeholder}
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && val.trim()) {
                            onConfirm(val);
                            setVal('');
                        }
                    }}
                />
                
                <div className="flex gap-4">
                    <button onClick={onClose} className="flex-1 border border-[#1a5c0b] text-[#1a5c0b] py-3 hover:text-[#38ff12] hover:border-[#38ff12] transition-colors font-mono uppercase">
                        ABORT
                    </button>
                    <button 
                        onClick={() => {
                            if (val.trim()) {
                                onConfirm(val);
                                setVal('');
                            }
                        }} 
                        className="flex-1 bg-[#1a5c0b] text-white border border-[#38ff12] py-3 hover:bg-[#38ff12] hover:text-black font-bold uppercase transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!val.trim()}
                    >
                        EXECUTE
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export const ResistanceEditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  nameValue: string;
  descValue: string;
  onNameChange: (v: string) => void;
  onDescChange: (v: string) => void;
}> = ({ isOpen, onClose, title, nameValue, descValue, onNameChange, onDescChange }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0a0a0a] border-2 border-[#38ff12] p-1 w-full max-w-[600px] shadow-[0_0_30px_rgba(56,255,18,0.2)] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1a5c0b] p-2 flex justify-between items-center border-b border-[#38ff12] mb-6">
            <h2 className="font-bold text-white font-tech tracking-widest truncate pr-4">{title}</h2>
            <button onClick={onClose} className="text-[#38ff12] hover:text-white px-2 text-xl">&times;</button>
        </div>
        
        <div className="px-6 pb-6 flex flex-col gap-4">
            <div>
                <label className="block text-[#1a5c0b] text-xs mb-1 font-mono uppercase">IDENTITY / DESIGNATION</label>
                <input 
                    type="text" 
                    value={nameValue} 
                    onChange={e => onNameChange(e.target.value)}
                    className="w-full bg-[#051a05] border border-[#38ff12] p-2 text-xl font-mono text-[#38ff12] focus:outline-none focus:bg-[#0a2e0a]"
                />
            </div>

            <div>
                <label className="block text-[#1a5c0b] text-xs mb-1 font-mono uppercase">DATA / DETAILS</label>
                <textarea 
                    value={descValue} 
                    onChange={e => onDescChange(e.target.value)}
                    className="w-full h-60 bg-[#051a05] border border-[#38ff12] p-4 text-[#38ff12] font-mono text-sm focus:outline-none focus:bg-[#0a2e0a] resize-none"
                />
            </div>
            
            <button onClick={onClose} className="mt-2 w-full bg-[#1a5c0b] border border-[#38ff12] text-white py-3 hover:bg-[#38ff12] hover:text-black transition-colors font-mono font-bold uppercase">
                SAVE & CLOSE
            </button>
        </div>
      </div>
    </div>
  );
};

export const ResistanceConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}> = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
        <div className="bg-[#0a0a0a] border-2 border-red-500 p-1 w-full max-w-[500px] shadow-[0_0_30px_rgba(255,0,0,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="bg-red-900/30 p-2 flex justify-between items-center border-b border-red-500 mb-6">
                <span className="font-bold text-red-500 font-tech tracking-widest uppercase">{title}</span>
                <button onClick={onClose} className="text-red-500 hover:text-white px-2 font-mono">X</button>
            </div>
            
            <div className="px-6 pb-6 flex flex-col gap-6 text-center">
                <div className="text-white font-mono">{message}</div>
                <div className="flex gap-4">
                    <button onClick={onClose} className="flex-1 border border-red-900 text-red-500 py-3 hover:bg-red-900/20 transition-colors font-mono uppercase">
                        CANCEL
                    </button>
                    <button 
                        onClick={() => { onConfirm(); onClose(); }} 
                        className="flex-1 bg-red-600 text-white border border-red-500 py-3 hover:bg-red-500 hover:text-black font-bold uppercase transition-all font-mono"
                    >
                        CONFIRM
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export const ResistanceImageUploadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [tab, setTab] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setError('');
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 800 * 1024) { // 800KB limit warning
              setError("WARNING: File size large. Database limit may be exceeded.");
          }
          const reader = new FileReader();
          reader.onloadend = () => {
              onConfirm(reader.result as string);
              onClose();
          };
          reader.readAsDataURL(file);
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
        <div className="bg-[#0a0a0a] border-2 border-[#38ff12] p-1 w-full max-w-[500px] shadow-[0_0_30px_rgba(56,255,18,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1a5c0b] p-2 flex justify-between items-center border-b border-[#38ff12] mb-6">
                <span className="font-bold text-white font-tech tracking-widest">UPLOAD VISUAL DATA</span>
                <button onClick={onClose} className="text-[#38ff12] hover:text-white px-2 font-mono">X</button>
            </div>
            
            <div className="px-6 pb-6 flex flex-col gap-4">
                <div className="flex gap-2 mb-2">
                    <button onClick={() => setTab('url')} className={`flex-1 py-2 font-mono text-sm border ${tab==='url' ? 'bg-[#38ff12] text-black border-[#38ff12]' : 'text-[#1a5c0b] border-[#1a5c0b]'}`}>LINK URL</button>
                    <button onClick={() => setTab('file')} className={`flex-1 py-2 font-mono text-sm border ${tab==='file' ? 'bg-[#38ff12] text-black border-[#38ff12]' : 'text-[#1a5c0b] border-[#1a5c0b]'}`}>LOCAL FILE</button>
                </div>

                {tab === 'url' ? (
                     <input 
                        autoFocus
                        type="text" 
                        className="bg-[#051a05] border border-[#38ff12] p-4 text-[#38ff12] font-mono text-sm outline-none focus:bg-[#0a2e0a] placeholder-[#1a5c0b]"
                        placeholder="HTTPS://..."
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && url.trim()) {
                                onConfirm(url);
                                onClose();
                            }
                        }}
                    />
                ) : (
                    <div className="border border-dashed border-[#38ff12] p-8 text-center relative hover:bg-[#38ff12]/10 transition-colors cursor-pointer">
                        <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                        <div className="text-[#38ff12] font-mono">CLICK TO SELECT FILE</div>
                        <div className="text-[#1a5c0b] text-xs mt-2">SUPPORTS: JPG, PNG, WEBP</div>
                        {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
                    </div>
                )}
                
                {tab === 'url' && (
                    <button 
                        onClick={() => {
                            if (url.trim()) {
                                onConfirm(url);
                                onClose();
                            }
                        }} 
                        className="mt-2 w-full bg-[#1a5c0b] text-white border border-[#38ff12] py-3 hover:bg-[#38ff12] hover:text-black font-bold uppercase transition-all font-mono"
                    >
                        CONFIRM LINK
                    </button>
                )}
            </div>
        </div>
    </div>
  );
};
