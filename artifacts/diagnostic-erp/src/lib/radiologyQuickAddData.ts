// ─── Study Context Detection ───────────────────────────────────────────────

export interface QuickAddButton {
  label: string;
  text: string;
  shortcut: string; // Alt+1, Alt+2 etc
  impression?: string;
}

export interface StudyContext {
  id: string;
  label: string;
  modality: string;
  bodyPart?: string;
  testKeywords: string[];
  buttons: QuickAddButton[];
  smartFormats?: SmartFormat[];
}

export interface SmartFormat {
  id: string;
  label: string;
  shortcut: string;
  title?: string;
  technique?: string;
  findings: string;
  impression?: string;
  advice?: string;
}

export interface MacroEntry {
  id: string;
  shortcut: string;
  expansion: string;
  modality?: string;
  bodyPart?: string;
}

// ─── Study Contexts ─────────────────────────────────────────────────────────

export const STUDY_CONTEXTS: StudyContext[] = [
  {
    id: "usg-abdomen",
    label: "USG Abdomen",
    modality: "US",
    bodyPart: "ABDOMEN",
    testKeywords: ["abdomen", "abdominal", "usg abd", "ultrasound abdomen", "whole abdomen"],
    buttons: [
      { label: "Normal Liver", text: "LIVER: Normal in size, shape, and echotexture. No focal lesion or mass.", shortcut: "Alt+1", impression: "Normal liver." },
      { label: "Normal GB", text: "GALLBLADDER: Normal wall thickness. No calculus. CBD not dilated.", shortcut: "Alt+2", impression: "Normal gallbladder." },
      { label: "Normal Pancreas", text: "PANCREAS: Normal size, shape, and echotexture. No mass.", shortcut: "Alt+3", impression: "Normal pancreas." },
      { label: "Normal Kidneys", text: "KIDNEYS: Both normal size and echotexture. No hydronephrosis or calculus.", shortcut: "Alt+4", impression: "Normal kidneys." },
      { label: "No Fluid", text: "No free fluid seen in the peritoneal cavity.", shortcut: "Alt+5", impression: "No free fluid." },
      { label: "Liver Fatty", text: "LIVER: Enlarged with diffuse increased echotexture suggestive of fatty infiltration.", shortcut: "Alt+6", impression: "Fatty liver." },
    ],
    smartFormats: [
      { id: "usg-abd-norm", label: "Normal Abdomen", shortcut: "Shift+Alt+1", findings: "LIVER: Normal in size, shape, and echotexture. No focal lesion.\nGALLBLADDER: Normal wall thickness. No calculus.\nPANCREAS: Normal size and echotexture.\nSPLEEN: Normal size.\nKIDNEYS: Both normal size. No hydronephrosis.\nBLADDER: Normal wall.\nNo free fluid." },
      { id: "usg-abd-gb", label: "GB Calculus", shortcut: "Shift+Alt+2", findings: "GALLBLADDER: Distended with thickened wall. Multiple echogenic foci with posterior acoustic shadowing noted. CBD not dilated.", impression: "Gallbladder calculi." },
      { id: "usg-abd-kid", label: "Renal Calculus", shortcut: "Shift+Alt+3", findings: "KIDNEYS: Right kidney shows an echogenic focus with posterior shadowing in the upper pole. Left kidney normal. No hydronephrosis.", impression: "Right renal calculus." },
      { id: "usg-abd-panc", label: "Pancreatitis", shortcut: "Shift+Alt+4", findings: "PANCREAS: Enlarged, hypoechoic, poorly defined. Peripancreatic fluid collection noted.", impression: "Features suggestive of acute pancreatitis." },
      { id: "usg-abd-cbd", label: "CBD Dilated", shortcut: "Shift+Alt+5", findings: "CBD: Dilated (8.5 mm), abrupt cutoff at the distal end. Hepatic ducts show mild dilatation.", impression: "Obstructive jaundice — CBD dilated." },
      { id: "usg-abd-cyst", label: "Liver Cyst", shortcut: "Shift+Alt+6", findings: "LIVER: Well-defined anechoic lesion in the right lobe, measuring 2.5 x 2.0 cm, with posterior enhancement. No internal echoes.", impression: "Simple hepatic cyst." },
    ],
  },
  {
    id: "mri-brain",
    label: "MRI Brain",
    modality: "MR",
    bodyPart: "BRAIN",
    testKeywords: ["brain", "cranial", "mri brain", "head mri", "brain plain"],
    buttons: [
      { label: "Normal Brain", text: "BRAIN PARENCHYMA: Normal signal intensity on all sequences. No focal lesion.", shortcut: "Alt+1", impression: "Normal MRI brain." },
      { label: "Normal Ventricles", text: "VENTRICLES: Normal size and configuration. No hydrocephalus.", shortcut: "Alt+2", impression: "Normal ventricles." },
      { label: "No Shift", text: "MIDLINE: No shift. No mass effect.", shortcut: "Alt+3", impression: "No midline shift." },
      { label: "Vascular Normal", text: "CEREBRAL VESSELS: Normal flow voids. No abnormal signal.", shortcut: "Alt+4", impression: "Normal vascular flow." },
      { label: "Infarct", text: "HYPERINTENSE area on T2/FLAIR in the ___ territory, suggestive of acute infarct.", shortcut: "Alt+5", impression: "Acute infarct." },
      { label: "Mass Effect", text: "HYPODENSE/HYPERINTENSE lesion in the ___ region with surrounding edema and mass effect.", shortcut: "Alt+6", impression: "Space-occupying lesion." },
    ],
    smartFormats: [
      { id: "mri-brain-norm", label: "Normal Brain", shortcut: "Shift+Alt+1", findings: "BRAIN PARENCHYMA: Normal signal intensity on all sequences.\nVENTRICLES: Normal size and configuration.\nMIDLINE: No shift.\nEXTRACRANIAL SOFT TISSUES: Normal.\nNo focal lesion, hemorrhage, or infarct.", impression: "Normal MRI brain study." },
      { id: "mri-brain-inf", label: "Acute Infarct", shortcut: "Shift+Alt+2", findings: "HYPERINTENSE area on T2/FLAIR in the right MCA territory with restricted diffusion on DWI. No hemorrhagic transformation.", impression: "Acute infarct in the right MCA territory." },
      { id: "mri-brain-mass", label: "Mass Lesion", shortcut: "Shift+Alt+3", findings: "Well-defined mass in the left frontal lobe, T1 hypointense, T2 hyperintense, with ring enhancement. Perilesional edema with mass effect.", impression: "Space-occupying lesion in the left frontal lobe." },
      { id: "mri-brain-mets", label: "Metastases", shortcut: "Shift+Alt+4", findings: "Multiple small ring-enhancing lesions in the bilateral cerebral hemispheres and cerebellum. Surrounding vasogenic edema.", impression: "Multiple intracranial metastases." },
      { id: "mri-brain-dem", label: "Demyelination", shortcut: "Shift+Alt+5", findings: "Multiple hyperintense lesions in the periventricular white matter, juxtacortical, and infratentorial regions. Some lesions show enhancement. Dawson fingers noted.", impression: "Demyelinating disease — likely multiple sclerosis." },
    ],
  },
  {
    id: "mri-ls-spine",
    label: "MRI LS Spine",
    modality: "MR",
    bodyPart: "SPINE",
    testKeywords: ["ls spine", "lumbar", "l-s spine", "lumbosacral", "mri ls"],
    buttons: [
      { label: "Normal Spine", text: "VERTEBRAL BODIES: Normal height and alignment. No marrow signal abnormality.", shortcut: "Alt+1", impression: "Normal spine." },
      { label: "Disc Bulge", text: "DISC BULGE at L___ level, indenting the thecal sac.", shortcut: "Alt+2", impression: "Disc bulge." },
      { label: "Disc Herniation", text: "DISC HERNIATION at L___ level, with right/left paracentral protrusion.", shortcut: "Alt+3", impression: "Disc herniation." },
      { label: "Canal Stenosis", text: "SPINAL CANAL: Narrowed at L___ level. AP diameter reduced.", shortcut: "Alt+4", impression: "Canal stenosis." },
      { label: "Normal Cord", text: "SPINAL CORD: Normal signal. No intramedullary lesion.", shortcut: "Alt+5", impression: "Normal cord." },
      { label: "Facet Arthropathy", text: "FACET JOINTS: Degenerative changes at L___ level with hypertrophy.", shortcut: "Alt+6", impression: "Facet arthropathy." },
    ],
    smartFormats: [
      { id: "mri-ls-norm", label: "Normal LS Spine", shortcut: "Shift+Alt+1", findings: "VERTEBRAL BODIES: Normal height and alignment. No marrow signal abnormality.\nDISCS: All normal height and signal. No bulge or herniation.\nSPINAL CANAL: Normal AP diameter.\nSPINAL CORD: Normal signal.\nFACET JOINTS: Normal.\nPARAVERTEBRAL SOFT TISSUES: Normal.", impression: "Normal MRI lumbosacral spine." },
      { id: "mri-ls-bulge", label: "Disc Bulge", shortcut: "Shift+Alt+2", findings: "L4-L5: Disc bulge, indenting the anterior thecal sac.\nL5-S1: Mild disc bulge.\nRest of the discs: Normal.\nVERTEBRAL BODIES: Normal.\nSPINAL CANAL: Normal.\nFACET JOINTS: Mild degenerative changes.", impression: "Disc bulge at L4-L5 and mild at L5-S1." },
      { id: "mri-ls-herniation", label: "Disc Herniation", shortcut: "Shift+Alt+3", findings: "L4-L5: Disc herniation with right paracentral protrusion.\nSPINAL CANAL: Narrowed at L4-L5 level.\nNEURAL FORAMINA: Right L4-L5 narrowed.\nFACET JOINTS: Hypertrophy.", impression: "Disc herniation at L4-L5 with right lateral recess stenosis." },
      { id: "mri-ls-canal", label: "Canal Stenosis", shortcut: "Shift+Alt+4", findings: "SPINAL CANAL: Severe narrowing at L4-L5 and moderate at L5-S1.\nDISCS: Degenerated at L3-L4, L4-L5, L5-S1.\nFACET JOINTS: Severe hypertrophy bilaterally.\nLIGAMENTUM FLAVUM: Thickened.\nSPINAL CORD: Normal signal.", impression: "Severe canal stenosis at L4-L5 and moderate at L5-S1." },
    ],
  },
  {
    id: "mri-cervical-spine",
    label: "MRI Cervical Spine",
    modality: "MR",
    bodyPart: "CERVICAL SPINE",
    testKeywords: ["cervical", "c-spine", "neck spine", "cervical spine", "mri cervical"],
    buttons: [
      { label: "Normal Cervical", text: "CERVICAL VERTEBRAE: Normal alignment and signal. No fracture.", shortcut: "Alt+1", impression: "Normal cervical spine." },
      { label: "Disc Bulge", text: "CERVICAL DISC BULGE at C___ level, indenting the thecal sac.", shortcut: "Alt+2", impression: "Cervical disc bulge." },
      { label: "Disc Herniation", text: "CERVICAL DISC HERNIATION at C___ level, with right/left paracentral protrusion.", shortcut: "Alt+3", impression: "Cervical disc herniation." },
      { label: "Cord Compression", text: "SPINAL CORD: Compression at C___ level. T2 hyperintense signal.", shortcut: "Alt+4", impression: "Cord compression with myelomalacia." },
      { label: "Normal Cord", text: "SPINAL CORD: Normal caliber and signal. No intramedullary lesion.", shortcut: "Alt+5", impression: "Normal spinal cord." },
      { label: "Foraminal Stenosis", text: "NEURAL FORAMINA: Bilateral narrowing at C___ level.", shortcut: "Alt+6", impression: "Foraminal stenosis." },
    ],
    smartFormats: [
      { id: "mri-cs-norm", label: "Normal Cervical Spine", shortcut: "Shift+Alt+1", findings: "CERVICAL VERTEBRAE: Normal alignment. No marrow signal abnormality.\nDISCS: All normal height and signal.\nSPINAL CANAL: Normal AP diameter.\nSPINAL CORD: Normal signal and caliber.\nFACET JOINTS: Normal.\nPARAVERTEBRAL SOFT TISSUES: Normal.", impression: "Normal MRI cervical spine." },
      { id: "mri-cs-bulge", label: "Cervical Disc Bulge", shortcut: "Shift+Alt+2", findings: "C5-C6: Disc bulge, indenting the anterior thecal sac.\nC6-C7: Mild disc bulge.\nRest of the discs: Normal.\nSPINAL CANAL: Normal.\nSPINAL CORD: Normal.", impression: "Disc bulge at C5-C6 and mild at C6-C7." },
      { id: "mri-cs-herniation", label: "Cervical Disc Herniation", shortcut: "Shift+Alt+3", findings: "C5-C6: Disc herniation with right paracentral protrusion.\nSPINAL CANAL: Narrowed at C5-C6 level.\nNEURAL FORAMINA: Right C5-C6 narrowed.\nSPINAL CORD: No signal abnormality.", impression: "Disc herniation at C5-C6 with right lateral recess stenosis." },
      { id: "mri-cs-cord", label: "Cord Compression", shortcut: "Shift+Alt+4", findings: "C5-C6: Disc herniation with severe canal stenosis.\nSPINAL CORD: Compression at C5-C6 level with T2 hyperintense signal suggestive of myelomalacia.\nFACET JOINTS: Hypertrophy.", impression: "Severe canal stenosis at C5-C6 with cord compression." },
    ],
  },
  {
    id: "ct-brain",
    label: "CT Brain",
    modality: "CT",
    bodyPart: "BRAIN",
    testKeywords: ["ct brain", "brain ct", "ct head", "head ct", "ncct brain"],
    buttons: [
      { label: "Normal Brain", text: "BRAIN PARENCHYMA: Normal attenuation. No focal lesion.", shortcut: "Alt+1", impression: "Normal CT brain." },
      { label: "Normal Ventricles", text: "VENTRICLES: Normal size. No hydrocephalus.", shortcut: "Alt+2", impression: "Normal ventricles." },
      { label: "No Hemorrhage", text: "No intracranial hemorrhage.", shortcut: "Alt+3", impression: "No hemorrhage." },
      { label: "Bone Normal", text: "CALVARIUM: Normal. No fracture.", shortcut: "Alt+4", impression: "Normal skull." },
      { label: "Infarct", text: "HYPODENSE area in the ___ territory, suggestive of acute infarct.", shortcut: "Alt+5", impression: "Acute infarct." },
      { label: "SAH", text: "HYPERDENSE material in the sulci and basal cisterns, suggestive of SAH.", shortcut: "Alt+6", impression: "Subarachnoid hemorrhage." },
    ],
    smartFormats: [
      { id: "ct-brain-norm", label: "Normal CT Brain", shortcut: "Shift+Alt+1", findings: "BRAIN PARENCHYMA: Normal attenuation. No focal lesion.\nVENTRICLES: Normal size and configuration.\nMIDLINE: Not shifted.\nCALVARIUM: Normal. No fracture.\nPARANASAL SINUSES: Normal.", impression: "Normal CT brain." },
      { id: "ct-brain-inf", label: "Acute Infarct", shortcut: "Shift+Alt+2", findings: "HYPODENSE area in the right MCA territory, with effacement of sulci. No hemorrhagic transformation.\nVENTRICLES: Normal.", impression: "Acute infarct in the right MCA territory." },
      { id: "ct-brain-sah", label: "SAH", shortcut: "Shift+Alt+3", findings: "HYPERDENSE material in the sulci, basal cisterns, and interhemispheric fissure. No intraparenchymal hemorrhage.\nVENTRICLES: Mildly enlarged.", impression: "Subarachnoid hemorrhage." },
      { id: "ct-brain-trauma", label: "Head Trauma", shortcut: "Shift+Alt+4", findings: "FRACTURE: Linear fracture in the right parietal bone.\nEDH/SDH: Small epidural hematoma in the right temporal region.\nBRAIN: No midline shift.\nVENTRICLES: Normal.", impression: "Right parietal fracture with small epidural hematoma." },
    ],
  },
  {
    id: "xray-chest",
    label: "X-ray Chest",
    modality: "CR",
    bodyPart: "CHEST",
    testKeywords: ["chest", "xray chest", "cxr", "chest xray", "chest pa", "chest pa view"],
    buttons: [
      { label: "Normal Lung", text: "LUNG FIELDS: Clear bilaterally. No infiltrate.", shortcut: "Alt+1", impression: "Normal lungs." },
      { label: "Normal Cardiac", text: "CARDIAC SILHOUETTE: Normal size. CTR < 50%.", shortcut: "Alt+2", impression: "Normal cardiac size." },
      { label: "Normal Diaphragm", text: "COSTOPHRENIC ANGLES: Sharp bilaterally. Diaphragm contour normal.", shortcut: "Alt+3", impression: "Normal diaphragm." },
      { label: "Pneumonia", text: "HOMOGENEOUS opacity in the right/left lower zone, suggestive of pneumonia.", shortcut: "Alt+4", impression: "Pneumonia." },
      { label: "Pleural Effusion", text: "BLUNTING of the costophrenic angle, suggestive of pleural effusion.", shortcut: "Alt+5", impression: "Pleural effusion." },
      { label: "Pneumothorax", text: "AIR in the right/left pleural space. No lung markings.", shortcut: "Alt+6", impression: "Pneumothorax." },
    ],
    smartFormats: [
      { id: "cxr-norm", label: "Normal CXR", shortcut: "Shift+Alt+1", findings: "LUNG FIELDS: Clear bilaterally.\nCARDIAC SILHOUETTE: Normal size.\nMEDIASTINUM: Normal width.\nCOSTOPHRENIC ANGLES: Sharp bilaterally.\nBONY THORAX: No fracture.\nDIAPHRAGM: Normal contour.", impression: "Normal chest X-ray." },
      { id: "cxr-pneumonia", label: "Pneumonia", shortcut: "Shift+Alt+2", findings: "HOMOGENEOUS opacity in the right lower zone with air bronchogram. Rest of the lung fields clear.\nCARDIAC SILHOUETTE: Normal.\nCOSTOPHRENIC ANGLES: Sharp.", impression: "Right lower zone pneumonia." },
      { id: "cxr-effusion", label: "Pleural Effusion", shortcut: "Shift+Alt+3", findings: "BLUNTING of the right costophrenic angle with meniscus sign. Mild right lower zone opacity.\nCARDIAC SILHOUETTE: Normal.\nLEFT LUNG: Clear.\nBONY THORAX: Normal.", impression: "Right pleural effusion." },
      { id: "cxr-pneumothorax", label: "Pneumothorax", shortcut: "Shift+Alt+4", findings: "AIR in the right pleural space. No lung markings in the right upper zone. Lung collapsed.\nTRACHEA: Shifted to the left.\nMEDIASTINUM: Shifted to the left.", impression: "Right tension pneumothorax." },
      { id: "cxr-cardiomegaly", label: "Cardiomegaly", shortcut: "Shift+Alt+5", findings: "CARDIAC SILHOUETTE: Enlarged. CTR > 50%.\nPULMONARY VASCULATURE: Prominent.\nLUNG FIELDS: Mild congestion.\nCOSTOPHRENIC ANGLES: Sharp.", impression: "Cardiomegaly with mild pulmonary congestion." },
    ],
  },
  {
    id: "mri-pituitary",
    label: "MRI Brain Pituitary",
    modality: "MR",
    bodyPart: "BRAIN",
    testKeywords: ["pituitary", "mri pituitary", "sella", "brain with pituitary", "mri sella"],
    buttons: [
      { label: "Normal Pituitary", text: "PITUITARY: Normal size and signal. No mass.", shortcut: "Alt+1", impression: "Normal pituitary." },
      { label: "Normal Sella", text: "SELLA TURCICA: Normal size. No expansion.", shortcut: "Alt+2", impression: "Normal sella." },
      { label: "Normal Optic", text: "OPTIC CHIASMA: Normal. No compression.", shortcut: "Alt+3", impression: "Normal optic chiasma." },
      { label: "Pituitary Adenoma", text: "PITUITARY: Enlarged, T1 hypointense, T2 isointense, with suprasellar extension.", shortcut: "Alt+4", impression: "Pituitary adenoma." },
      { label: "Cavernous Sinus", text: "CAVERNOUS SINUS: Normal. No invasion.", shortcut: "Alt+5", impression: "Normal cavernous sinus." },
      { label: "Hemorrhage", text: "HYPERINTENSE area within the pituitary, suggestive of hemorrhage.", shortcut: "Alt+6", impression: "Pituitary apoplexy." },
    ],
    smartFormats: [
      { id: "mri-pit-norm", label: "Normal Pituitary", shortcut: "Shift+Alt+1", findings: "PITUITARY: Normal size (8mm x 6mm x 4mm) and signal.\nSELLA TURCICA: Normal size.\nOPTIC CHIASMA: Normal. No compression.\nCAVERNOUS SINUS: Normal.\nBRAIN PARENCHYMA: Normal.\nVENTRICLES: Normal.", impression: "Normal MRI pituitary study." },
      { id: "mri-pit-adenoma", label: "Pituitary Adenoma", shortcut: "Shift+Alt+2", findings: "PITUITARY: Enlarged (18mm x 14mm x 12mm), T1 hypointense, T2 isointense.\nSELLA TURCICA: Expanded.\nOPTIC CHIASMA: Compressed.\nCAVERNOUS SINUS: Normal.\nBRAIN: No mass.", impression: "Pituitary macroadenoma." },
    ],
  },
  {
    id: "mri-brain-cervical",
    label: "MRI Brain+Cervical",
    modality: "MR",
    bodyPart: "BRAIN",
    testKeywords: ["brain cervical", "brain and cervical", "mri brain + cervical", "brain with cervical spine"],
    buttons: [
      { label: "Normal Brain", text: "BRAIN: Normal signal. No lesion.", shortcut: "Alt+1", impression: "Normal brain." },
      { label: "Normal Cervical", text: "CERVICAL SPINE: Normal alignment. No disc lesion.", shortcut: "Alt+2", impression: "Normal cervical spine." },
      { label: "Normal Cord", text: "SPINAL CORD: Normal signal.", shortcut: "Alt+3", impression: "Normal spinal cord." },
      { label: "Disc Bulge", text: "CERVICAL DISC BULGE at C___ level.", shortcut: "Alt+4", impression: "Cervical disc bulge." },
      { label: "Brain Lesion", text: "HYPERINTENSE lesion in the ___ region.", shortcut: "Alt+5", impression: "Brain lesion." },
      { label: "Cord Signal", text: "SPINAL CORD: T2 hyperintense signal at C___ level.", shortcut: "Alt+6", impression: "Cord signal abnormality." },
    ],
    smartFormats: [
      { id: "mri-bc-norm", label: "Normal Brain+Cervical", shortcut: "Shift+Alt+1", findings: "BRAIN: Normal signal on all sequences. No lesion.\nCERVICAL SPINE: Normal alignment. All discs normal.\nSPINAL CORD: Normal signal.\nVENTRICLES: Normal.\nEXTRACRANIAL: Normal.", impression: "Normal MRI brain and cervical spine." },
      { id: "mri-bc-brain", label: "Brain Lesion", shortcut: "Shift+Alt+2", findings: "BRAIN: T2 hyperintense lesion in the right frontal lobe. No mass effect.\nCERVICAL SPINE: Normal.\nSPINAL CORD: Normal.", impression: "Right frontal lobe lesion. Cervical spine normal." },
      { id: "mri-bc-cervical", label: "Cervical Disc Disease", shortcut: "Shift+Alt+3", findings: "CERVICAL SPINE: Disc bulge at C5-C6 and C6-C7.\nSPINAL CANAL: Narrowed at C5-C6.\nBRAIN: Normal.", impression: "Cervical disc disease at C5-C6 and C6-C7. Brain normal." },
    ],
  },
];

// ─── Default macros (20+) ───────────────────────────────────────────────────

export const DEFAULT_MACROS: MacroEntry[] = [
  { id: "macro-norm", shortcut: "norm", expansion: "Normal in size, shape, and echotexture." },
  { id: "macro-nles", shortcut: "nles", expansion: "No focal lesion seen." },
  { id: "macro-adq", shortcut: "adq", expansion: "Adequately visualized." },
  { id: "macro-nvis", shortcut: "nvis", expansion: "Not adequately visualized." },
  { id: "macro-enl", shortcut: "enl", expansion: "Enlarged in size." },
  { id: "macro-atr", shortcut: "atr", expansion: "Atrophic changes noted." },
  { id: "macro-ncal", shortcut: "ncal", expansion: "No calcification." },
  { id: "macro-nflu", shortcut: "nflu", expansion: "No free fluid." },
  { id: "macro-cor", shortcut: "cor", expansion: "Clinical correlation advised." },
  { id: "macro-fup", shortcut: "fup", expansion: "Follow-up advised." },
  { id: "macro-inc", shortcut: "inc", expansion: "Incidental finding." },
  { id: "macro-mild", shortcut: "mild", expansion: "Mild degenerative changes." },
  { id: "macro-mod", shortcut: "mod", expansion: "Moderate degenerative changes." },
  { id: "macro-sev", shortcut: "sev", expansion: "Severe degenerative changes." },
  { id: "macro-ok", shortcut: "ok", expansion: "Normal study." },
  { id: "macro-nab", shortcut: "nab", expansion: "No abnormality detected." },
  { id: "macro-nod", shortcut: "nod", expansion: "No definite abnormality detected." },
  { id: "macro-rec", shortcut: "rec", expansion: "Further evaluation recommended." },
  { id: "macro-ct", shortcut: "ctcor", expansion: "Clinical and laboratory correlation recommended." },
  { id: "macro-us", shortcut: "usfup", expansion: "Follow-up ultrasound advised." },
  { id: "macro-mri", shortcut: "mrifup", expansion: "Follow-up MRI advised." },
  { id: "macro-ctscan", shortcut: "ctfup", expansion: "Follow-up CT advised." },
  { id: "macro-dis", shortcut: "dis", expansion: "Discharge from follow-up not advised." },
  { id: "macro-older", shortcut: "older", expansion: "Age-related degenerative changes." },
  { id: "macro-stable", shortcut: "stable", expansion: "Stable findings compared to previous study." },
  { id: "macro-impr", shortcut: "impr", expansion: "Improving compared to previous study." },
  { id: "macro-worse", shortcut: "worse", expansion: "Worsening compared to previous study." },
  { id: "macro-hydr", shortcut: "hydr", expansion: "Hydronephrosis noted." },
  { id: "macro-calc", shortcut: "calc", expansion: "Calcification noted." },
  { id: "macro-cyst", shortcut: "cyst", expansion: "Simple cyst noted." },
  { id: "macro-mass", shortcut: "mass", expansion: "Mass lesion noted." },
];

// ─── Context detection ─────────────────────────────────────────────────────

export function detectStudyContext(
  modality: string,
  studyDescription?: string | null,
  testName?: string | null,
  bodyPart?: string | null,
): StudyContext | null {
  const desc = (studyDescription ?? "").toLowerCase();
  const test = (testName ?? "").toLowerCase();
  const body = (bodyPart ?? "").toLowerCase();
  const mod = (modality ?? "").toUpperCase();

  // Match by testKeywords in descending priority
  const score = (ctx: StudyContext): number => {
    let s = 0;
    if (ctx.modality === mod || ctx.modality === "ALL") s += 10;
    if (ctx.bodyPart && body.includes(ctx.bodyPart.toLowerCase())) s += 20;
    for (const kw of ctx.testKeywords) {
      if (desc.includes(kw.toLowerCase())) s += 5;
      if (test.includes(kw.toLowerCase())) s += 5;
    }
    return s;
  };

  let best: StudyContext | null = null;
  let bestScore = 0;
  for (const ctx of STUDY_CONTEXTS) {
    const s = score(ctx);
    if (s > bestScore) {
      bestScore = s;
      best = ctx;
    }
  }

  return bestScore >= 5 ? best : null;
}

// ─── Merge engine for Smart Format ──────────────────────────────────────────

export interface MergedFormat {
  title: string;
  technique: string;
  findings: string;
  impression: string;
  advice: string;
}

export function mergeSmartFormats(formats: SmartFormat[]): MergedFormat {
  // Deduplicate findings by line
  const seenLines = new Set<string>();
  const findingsLines: string[] = [];
  let impression = "";
  let advice = "";
  let title = "";
  let technique = "";

  for (const f of formats) {
    if (f.title) title = f.title; // last one wins
    if (f.technique) technique = f.technique; // last one wins
    if (f.impression) impression = f.impression; // last one wins
    if (f.advice) advice = f.advice; // last one wins
    const lines = (f.findings || "").split("\n").map((l) => l.trim()).filter((l) => l);
    for (const line of lines) {
      if (!seenLines.has(line)) {
        seenLines.add(line);
        findingsLines.push(line);
      }
    }
  }

  return {
    title,
    technique,
    findings: findingsLines.join("\n"),
    impression,
    advice,
  };
}
