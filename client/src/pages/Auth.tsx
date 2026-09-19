import {FormEvent,ReactNode,useState} from 'react';
import {useNavigate,Link,useSearchParams} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {Button,Card,Field} from '../components/ui';
import {ShieldCheck,MessageCircle} from 'lucide-react';

const WHATSAPP_CHANNEL='https://whatsapp.com/channel/0029Vb8r8KN4dTnFwnDT2J0D';

function AuthBox({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){
  return <div className="auth-page"><Card className="auth-card"><div className="brand big"><span>TM</span><div><b>TRUST MINE</b><small>Mine Today • Earn Tomorrow</small></div></div><div className="auth-trust"><ShieldCheck size={15}/> Secure account workspace</div><h1>{title}</h1><p>{subtitle}</p>{children}</Card></div>
}

function WhatsAppJoinPopup({onContinue}:{onContinue:()=>void}){
  return <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
    <div style={{width:'100%',maxWidth:'460px',background:'#fff',borderRadius:'24px',padding:'32px 26px',textAlign:'center',boxShadow:'0 25px 70px rgba(0,0,0,0.35)'}}>
      <div style={{width:'72px',height:'72px',margin:'0 auto 18px',borderRadius:'50%',background:'#25D366',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
        <MessageCircle size={38}/>
      </div>
      <h2 style={{margin:'0 0 10px',fontSize:'25px',fontWeight:800,color:'#111827'}}>Join Our WhatsApp Channel</h2>
      <p style={{margin:'0 auto 24px',maxWidth:'370px',color:'#6b7280',lineHeight:1.6,fontSize:'15px'}}>
        Stay updated with the latest TRUST MINE announcements, important updates, offers and platform news. Join our official WhatsApp Channel before continuing.
      </p>
      <a
        href={WHATSAPP_CHANNEL}
        target="_blank"
        rel="noreferrer"
        onClick={()=>sessionStorage.setItem('tm_whatsapp_join_seen','1')}
        style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'9px',width:'100%',boxSizing:'border-box',padding:'14px 18px',borderRadius:'12px',background:'#25D366',color:'#fff',textDecoration:'none',fontWeight:700,fontSize:'15px',marginBottom:'12px'}}
      >
        <MessageCircle size={19}/>Join WhatsApp Channel
      </a>
      <button
        type="button"
        onClick={onContinue}
        style={{width:'100%',padding:'13px 18px',borderRadius:'12px',border:'1px solid #d1d5db',background:'#f9fafb',color:'#374151',fontWeight:700,fontSize:'14px',cursor:'pointer'}}
      >
        I've Joined — Continue
      </button>
      <p style={{margin:'16px 0 0',fontSize:'12px',color:'#9ca3af'}}>Please join the channel to receive important updates.</p>
    </div>
  </div>
}

export function Login(){
  const [email,setEmail]=useState('admin@trustmine.demo'),
    [password,setPassword]=useState('Admin@12345'),
    [error,setError]=useState(''),
    [loading,setLoading]=useState(false),
    [showWhatsApp,setShowWhatsApp]=useState(false);

  const {login}=useAuth();
  const nav=useNavigate();

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setLoading(true);
    setError('');

    try{
      await login(email,password);
      nav('/dashboard');

      if(sessionStorage.getItem('tm_whatsapp_join_seen')!=='1'){
        setTimeout(()=>setShowWhatsApp(true),350);
      }
    }catch(x:any){
      setError(x?.message||x?.response?.data?.message||'Login failed');
    }finally{
      setLoading(false);
    }
  };

  const continueAfterWhatsApp=()=>{
    sessionStorage.setItem('tm_whatsapp_join_seen','1');
    setShowWhatsApp(false);
  };

  return <>
    <AuthBox title="Welcome back" subtitle="Sign in to your TRUST MINE workspace">
      <form onSubmit={submit} className="form-grid">
        <Field label="Email"><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></Field>
        <Field label="Password"><input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/></Field>
        {error&&<p className="error">{error}</p>}
        <Button type="submit" loading={loading}>Sign in</Button>
      </form>
      <div className="auth-row"><Link to="/forgot-password">Forgot password?</Link><span>Demo: admin@trustmine.demo / Admin@12345</span></div>
      <p className="auth-link">No account? <Link to="/register">Create one</Link></p>
    </AuthBox>

    {showWhatsApp&&<WhatsAppJoinPopup onContinue={continueAfterWhatsApp}/>}
  </>
}

export function Register(){
  const [q]=useSearchParams();
  const referralFromUrl=q.get('ref')?.trim()||'';
  const [form,setForm]=useState({fullName:'',username:'',email:'',phone:'',password:'',referralCode:referralFromUrl}),
    [error,setError]=useState(''),
    [loading,setLoading]=useState(false);
  const {register}=useAuth();
  const nav=useNavigate();
  const update=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    if(form.password.length<8){setError('Password must be at least 8 characters.');return}
    setLoading(true);
    try{await register(form);nav('/dashboard')}
    catch(x:any){setError(x?.message||'Registration failed')}
    finally{setLoading(false)}
  };

  return <AuthBox title="Create account" subtitle="Create a demo-ready account. Backend validation will remain authoritative.">
    <form onSubmit={submit} className="form-grid two">
      <Field label="Full name"><input value={form.fullName} onChange={e=>update('fullName',e.target.value)} required/></Field>
      <Field label="Username"><input value={form.username} onChange={e=>update('username',e.target.value)} required/></Field>
      <Field label="Email"><input type="email" value={form.email} onChange={e=>update('email',e.target.value)} required/></Field>
      <Field label="Phone"><input value={form.phone} onChange={e=>update('phone',e.target.value)}/></Field>
      <Field label="Password"><input type="password" value={form.password} onChange={e=>update('password',e.target.value)} required minLength={8}/></Field>
      <Field label="Referral code"><input value={form.referralCode} onChange={e=>update('referralCode',e.target.value)} placeholder="Optional"/></Field>
      {error&&<p className="error full">{error}</p>}
      <div className="full"><Button type="submit" loading={loading}>Create account</Button></div>
    </form>
    <p className="auth-link">Already registered? <Link to="/login">Sign in</Link></p>
  </AuthBox>
}

export function ForgotPassword(){
  return <AuthBox title="Reset access" subtitle="Password reset delivery is not configured in this build.">
    <div className="notice">No reset email provider is connected, so this action is intentionally unavailable rather than pretending to send a reset message.</div>
    <Button disabled>Reset request unavailable</Button>
    <p className="auth-link"><Link to="/login">Back to sign in</Link></p>
  </AuthBox>
}

export function ResetPassword(){
  const [q]=useSearchParams();
  return <AuthBox title="Choose a new password" subtitle={`Reset token: ${q.get('token')?'provided':'awaiting token'}`}>
    <div className="notice">Password reset is unavailable until a server-side reset-token and email provider is configured.</div>
    <Button disabled>Update password unavailable</Button>
    <p className="auth-link"><Link to="/login">Back to sign in</Link></p>
  </AuthBox>
}

