import {FormEvent,useEffect,useState} from 'react';
import {useSearchParams,useNavigate} from 'react-router-dom';
import {depositService,packageService,paymentMethodService,settingsService} from '../services';
import {Button,Card,Field,PageState} from '../components/ui';
import {PackagePlan,PaymentMethod,PlatformSettings} from '../types';
import {Upload,CheckCircle2,Image as ImageIcon} from 'lucide-react';
import {formatMoney} from '../config/currency';

export default function Deposit(){
 const [q]=useSearchParams();
 const nav=useNavigate();

 const [plans,setPlans]=useState<PackagePlan[]>([]);
 const [methods,setMethods]=useState<PaymentMethod[]>([]);
 const [settings,setSettings]=useState<PlatformSettings|null>(null);

 const [packageId,setPackageId]=useState(q.get('packageId')||'');
 const [method,setMethod]=useState('');
 const [amount,setAmount]=useState('');
 const [reference,setReference]=useState('');
 const [proofUrl,setProofUrl]=useState('');
 const [proofFile,setProofFile]=useState<File|null>(null);
 const [preview,setPreview]=useState('');
 const [loading,setLoading]=useState(true);
 const [uploading,setUploading]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');

 useEffect(()=>{
  Promise.all([
   packageService.getPackages(),
   paymentMethodService.getMethods(),
   settingsService.getSettings()
  ])
  .then(([p,m,s])=>{
   setPlans(p);
   setMethods(m);
   setSettings(s);

   if(!method&&m[0]){
    setMethod(m[0].code);
   }
  })
  .catch(()=>{
   setError('Could not load deposit configuration.');
  })
  .finally(()=>{
   setLoading(false);
  });
 },[]);

 useEffect(()=>{
  const p=plans.find(x=>x._id===packageId);

  if(p){
   setAmount(String(p.amount));
  }
 },[packageId,plans]);

 const selected=methods.find(m=>m.code===method);
 const pkg=plans.find(p=>p._id===packageId);

 const handleProofChange=(file:File|null)=>{
  setError('');

  if(!file){
   setProofFile(null);
   setPreview('');
   return;
  }

  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
   setError('Only JPG, PNG and WEBP screenshots are allowed.');
   return;
  }

  if(file.size>5*1024*1024){
   setError('Payment screenshot must be 5MB or smaller.');
   return;
  }

  setProofFile(file);
  setPreview(URL.createObjectURL(file));
 };

 const uploadProof=async()=>{
  if(!proofFile){
   throw new Error('Payment screenshot is required.');
  }

  setUploading(true);

  try{
   const r=await depositService.uploadProof(proofFile);
   setProofUrl(r.proofUrl);
   return r.proofUrl;
  }finally{
   setUploading(false);
  }
 };

 const submit=async(e:FormEvent)=>{
  e.preventDefault();

  setSubmitting(true);
  setMessage('');
  setError('');

  try{
   let uploadedProofUrl=proofUrl;

   if(!uploadedProofUrl){
    uploadedProofUrl=await uploadProof();
   }

   const r=await depositService.createDeposit({
    packageId,
    method,
    amount:Number(amount),
    reference,
    proofUrl:uploadedProofUrl
   });

   setMessage(
    r.message||
    'Deposit submitted for verification.'
   );

   setTimeout(()=>{
    nav('/deposit-history');
   },700);

  }catch(x:any){
   setError(
    x?.response?.data?.message||
    x?.message||
    'Deposit could not be submitted.'
   );
  }finally{
   setSubmitting(false);
  }
 };

 if(loading){
  return (
   <div className="page">
    <PageState
     type="loading"
     message="Loading deposit options."
    />
   </div>
  );
 }

 if(error&&!settings){
  return (
   <div className="page">
    <PageState
     type="error"
     message={error}
    />
   </div>
  );
 }

 return (
  <div className="page narrow">

   <Card>
    <div className="section-head">
     <div>
      <h2>Make a Deposit</h2>
      <p>Select a payment method and complete the manual payment.</p>
     </div>
    </div>

    {error&&(
     <div className="alert error">
      {error}
     </div>
    )}

    {message&&(
     <div className="alert success">
      <CheckCircle2 size={18}/>
      {message}
     </div>
    )}

    <form onSubmit={submit}>

     <Field label="Package">
      <select
       value={packageId}
       onChange={e=>setPackageId(e.target.value)}
       required
      >
       <option value="">Select package</option>

       {plans.map(p=>(
        <option key={p._id} value={p._id}>
         {p.name} — {formatMoney(p.amount,settings?.currency||'USD')}
        </option>
       ))}
      </select>
     </Field>

     <Field label="Payment Method">
      <select
       value={method}
       onChange={e=>{
        setMethod(e.target.value);
        setProofUrl('');
       }}
       required
      >
       {methods.map(m=>(
        <option key={m._id} value={m.code}>
         {m.name}
        </option>
       ))}
      </select>
     </Field>

     {selected&&(
      <div className="instruction">
       <div style={{display:'flex',alignItems:'center',gap:8}}>
        <strong>Send payment to this account</strong>
       </div>

       <div style={{marginTop:10}}>
        <small>Payment Method</small>
        <div><b>{selected.name}</b></div>
       </div>

       <div style={{marginTop:10}}>
        <small>Account / Receiving Details</small>
        <div
         style={{
          whiteSpace:'pre-wrap',
          wordBreak:'break-word',
          marginTop:4
         }}
        >
         {selected.accountDetails||'Account details are not configured yet.'}
        </div>
       </div>

       {selected.instructions&&(
        <div style={{marginTop:10}}>
         <small>Instructions</small>
         <div style={{whiteSpace:'pre-wrap'}}>
          {selected.instructions}
         </div>
        </div>
       )}
      </div>
     )}

     <Field label="Amount">
      <input
       type="number"
       min={selected?.minAmount||settings?.minimumDeposit||0}
       step="0.01"
       value={amount}
       onChange={e=>setAmount(e.target.value)}
       required
       readOnly={Boolean(pkg)}
      />
     </Field>

     <Field
      label="Transaction / Reference ID"
      hint="Enter the transaction ID shown by your payment provider."
     >
      <input
       value={reference}
       onChange={e=>setReference(e.target.value)}
       placeholder="Enter transaction ID"
       required
       minLength={2}
       maxLength={200}
      />
     </Field>

     <Field
      label="Payment Screenshot"
      hint="Upload a clear screenshot showing the successful payment. JPG, PNG or WEBP, maximum 5MB."
     >
      <input
       type="file"
       accept="image/jpeg,image/png,image/webp"
       onChange={e=>{
        handleProofChange(e.target.files?.[0]||null);
       }}
       required={!proofUrl}
      />

      {preview&&(
       <div style={{marginTop:12}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
         <ImageIcon size={16}/>
         <small>Selected screenshot</small>
        </div>

        <img
         src={preview}
         alt="Payment proof preview"
         style={{
          width:'100%',
          maxHeight:280,
          objectFit:'contain',
          borderRadius:10,
          border:'1px solid rgba(255,255,255,.12)'
         }}
        />
       </div>
      )}

      {proofUrl&&(
       <div style={{marginTop:8}}>
        <small>
         Payment screenshot uploaded successfully.
        </small>
       </div>
      )}
     </Field>

     <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
      <Button
       type="submit"
       loading={submitting||uploading}
       disabled={!packageId||!method||!amount||!reference||!proofFile&&!proofUrl}
      >
       <Upload size={15}/>
       {uploading?'Uploading screenshot…':'Submit Deposit'}
      </Button>
     </div>

    </form>
   </Card>

  </div>
 );
}
