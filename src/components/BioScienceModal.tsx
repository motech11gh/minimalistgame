import React, { useEffect, useState } from 'react';
import { evaluateLipinskiRuleOfFive } from '../game/rules';

export interface BioCompoundRecord {
  cid: number;
  name: string;
  chemblId: string;
  targetName: string;
  targetAccession: string;
  formula: string;
  mw: number;
  smiles: string;
  inchikey: string;
  xlogp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatableBonds: number;
  ic50nM: number;
  pchembl: number;
  mechanism: string;
  source?: string;
  combatBuff: {
    label: string;
    speedMultiplier: number;
    recoilReduction: number;
    regenPerSec: number;
    damageBonus: number;
  };
}

const QUICK_TRY_COMPOUNDS = [
  { cid: 5816, label: 'Epinephrine · CID 5816', role: 'Sympathetic Sprint Surge' },
  { cid: 2519, label: 'Caffeine · CID 2519', role: 'Neural ADS Stabilizer' },
  { cid: 3676, label: 'Lidocaine · CID 3676', role: 'Sodium Channel Analgesic' },
  { cid: 4236, label: 'Modafinil · CID 4236', role: 'Dopamine Focus Enhancer' },
  { cid: 5311068, label: 'Dexmedetomidine · CID 5311068', role: 'Marksman Steady Agonist' },
];

interface BioSciencePanelProps {
  selectedCid: number;
  onSelectCompound: (compound: BioCompoundRecord) => void;
}

export const BioSciencePanel: React.FC<BioSciencePanelProps> = ({
  selectedCid,
  onSelectCompound,
}) => {
  const [compound, setCompound] = useState<BioCompoundRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/science/compound/${selectedCid}`)
      .then((r) => r.json())
      .then((data: BioCompoundRecord) => {
        if (!active) return;
        setCompound(data);
        onSelectCompound(data);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCid]);

  const lipinski = compound ? evaluateLipinskiRuleOfFive(compound) : null;

  return (
    <div className="bg-slate-50 text-slate-900 rounded-lg border border-slate-200 p-3">
      {/* Top Quick-Try Example Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight text-slate-800">
            Combat Bio-Stimulant Workbench (PubChem PUG REST &amp; ChEMBL)
          </span>
          <span className="text-[11px] text-slate-500">
            · [Experimentally determined] Bioactivity &amp; Physicochemical Profile
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_TRY_COMPOUNDS.map((item) => {
            const active = item.cid === selectedCid;
            return (
              <button
                key={item.cid}
                type="button"
                onClick={() => {
                  fetch(`/api/science/compound/${item.cid}`)
                    .then((r) => r.json())
                    .then((data: BioCompoundRecord) => {
                      setCompound(data);
                      onSelectCompound(data);
                    })
                    .catch(() => {});
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#1A73E8] text-white'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && !compound ? (
        <div className="py-4 text-center text-xs text-slate-600 font-mono">
          Querying PubChem PUG REST &amp; ChEMBL bioactivity records...
        </div>
      ) : compound && lipinski ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
          {/* Left: 2D Molecular Schematic & Provenance */}
          <div className="md:col-span-4 bg-white border border-slate-200 rounded p-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-bold text-slate-900">{compound.name}</span>
                <span className="text-[11px] font-mono text-[#007B83] font-semibold">
                  {compound.formula}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mb-2">{compound.mechanism}</p>
            </div>

            {/* Clean SVG Molecular Graph Representation */}
            <div className="bg-slate-900 rounded p-2 flex items-center justify-between gap-2">
              <svg viewBox="0 0 120 56" className="w-24 h-12 shrink-0">
                <polygon
                  points="28,12 44,20 44,38 28,46 12,38 12,20"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
                <polygon
                  points="28,16 40,22 40,36 28,42 16,36 16,22"
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                />
                <line x1="44" y1="20" x2="64" y2="12" stroke="#34d399" strokeWidth="2" />
                <line x1="64" y1="12" x2="84" y2="22" stroke="#34d399" strokeWidth="2" />
                <line x1="84" y1="22" x2="104" y2="14" stroke="#f59e0b" strokeWidth="2" />
                <circle cx="64" cy="12" r="3.5" fill="#38bdf8" />
                <circle cx="84" cy="22" r="3.5" fill="#10b981" />
                <circle cx="104" cy="14" r="4" fill="#f59e0b" />
              </svg>
              <div className="text-right overflow-hidden">
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  SMILES: {compound.smiles}
                </div>
                <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                  Equipped Injector [G]: {compound.combatBuff.label}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-1.5 border-t border-slate-100">
              <span>Target: {compound.targetName}</span>
              <div className="flex items-center gap-2 font-mono">
                <a
                  href={`https://pubchem.ncbi.nlm.nih.gov/compound/${compound.cid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1A73E8] hover:underline"
                >
                  PubChem:{compound.cid}
                </a>
                <span>·</span>
                <a
                  href={`https://www.ebi.ac.uk/chembl/compound_report_card/${compound.chemblId}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#007B83] hover:underline"
                >
                  {compound.chemblId}
                </a>
              </div>
            </div>
          </div>

          {/* Right: Synchronized Quantitative Property & Lipinski Inspector */}
          <div className="md:col-span-8 bg-white border border-slate-200 rounded p-2.5 flex flex-col justify-between">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              <div className="p-1.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">MW (Da)</div>
                <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
                  {compound.mw.toFixed(1)}
                </div>
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">XLogP</div>
                <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
                  {compound.xlogp.toFixed(1)}
                </div>
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">TPSA (Å²)</div>
                <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
                  {compound.tpsa.toFixed(1)}
                </div>
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">HBD / HBA</div>
                <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
                  {compound.hbd} / {compound.hba}
                </div>
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">IC50 (nM)</div>
                <div className="text-xs font-mono font-bold tabular-nums text-[#1A73E8]">
                  {compound.ic50nM.toFixed(1)}
                </div>
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-500">pChEMBL</div>
                <div className="text-xs font-mono font-bold tabular-nums text-[#007B83]">
                  {compound.pchembl.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <span className="font-semibold text-[#059669]">
                  {lipinski.passesLipinski
                    ? `Lipinski Ro5 Compliant (${lipinski.violationCount} violations)`
                    : `Lipinski Alert (${lipinski.violationCount} violations)`}
                </span>
                <span>·</span>
                <span>
                  {lipinski.bbbPenetrant
                    ? 'CNS / Blood-Brain Barrier Penetrant (TPSA < 90 Å²)'
                    : 'Peripheral Systemic Distribution'}
                </span>
                <span>·</span>
                <span className="font-mono text-slate-500">UniProt:{compound.targetAccession}</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {compound.source || 'PubChem PUG REST'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
