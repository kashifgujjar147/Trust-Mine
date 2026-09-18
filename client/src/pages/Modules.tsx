import {FormEvent,ReactNode,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {depositService,withdrawalService,transactionService,teamService,rewardService,promoService,settingsService,notificationService,supportService,paymentMethodService,packageService,userService,telegramService,dashboardService} from '../services';
import {Card,Button,Field,PageState,Progress,StatusBadge,SearchBar} from '../components/ui';
import type {Deposit,PackagePlan,Transaction,TeamMember,RewardTier,PromoCode,PlatformSettings,Notification,SupportTicket,SupportMessage,Withdrawal as WithdrawalRecord,PaymentMethod,User} from '../types';
import {Copy,Check,ArrowRight,Send,LifeBuoy,CheckCircle,RefreshCw} from 'lucide-react';import {formatMoney} from '../config/currency';

function Shell({eyebrow,title,description,actions,children}:{eyebrow:string;title:string;description:string;actions?:ReactNode;children:ReactNode}){return <div className="page"><div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions&&<div className="actions">{actions}</div>}</div>{children}</div>}
function Table({headers,children,minWidth=760}:{headers:string[];children:ReactNode;minWidth?:number}){return <div className="table-wrap"><table style={{minWidth}}><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
let settingsPromise: Promise<PlatformSettings> | null = null;
let settingsCache: PlatformSettings | null = null;
let settingsCacheAt = 0;
const SETTINGS_CACHE_MS = 30000;

let teamCache: any = null;
let teamCacheAt = 0;
const TEAM_CACHE_MS = 10000;

function getCachedSettings(){
  if(settingsCache && Date.now()-settingsCacheAt<SETTINGS_CACHE_MS)return Promise.resolve(settingsCache);
  if(!settingsPromise){
    settingsPromise=settingsService.getSettings().then(s=>{
      settingsCache=s;
      settingsCacheAt=Date.now();
      return s;
    }).finally(()=>{settingsPromise=null});
  }
  return settingsPromise;
}

function useCurrency(){
  const [currency,setCurrency]=useState('USD');
  useEffect(()=>{void getCachedSettings().then(s=>setCurrency(s.currency||'USD')).catch(()=>undefined)},[]);
  return currency
}

export function PackageDetails({id}:{id:string}){const currency=useCurrency();const [cycleHours,setCycleHours]=useState(24);useEffect(()=>{void getCachedSettings().then(x=>setCycleHours(Number(x.cycleIntervalHours||24))).catch(()=>undefined)},[]);const [p,setP]=useState<PackagePlan|null>(null),[error,setError]=useState('');const nav=useNavigate();const load=()=>{setError('');packageService.getPackage(id).then(v=>{if(v)setP(v);else setError('Package not found.')}).catch(e=>setError(e.message||'Unable to load package.'))};useEffect(()=>{void load()},[id]);if(error)return <Shell eyebrow="PACKAGE" title="Package details" description="The requested package could not be loaded."><PageState type="error" message={error} onRetry={load}/></Shell>;if(!p)return <Shell eyebrow="PACKAGE" title="Package details" description="Package configuration"><Card><div className="detail-hero"><span className="mini">{cycleHours}-HOUR CYCLE</span><strong>Package details</strong><p className="muted-copy">Package information is loading in the background.</p></div></Card></Shell>;return <Shell eyebrow="PACKAGE" title={p.name} description="Review the server-configured package before starting the deposit flow."><div className="detail-grid"><Card><div className="detail-hero"><span className="mini">{cycleHours}-HOUR CYCLE</span><StatusBadge status={p.status}/><strong>{formatMoney(p.amount,currency)}</strong><p>{p.description}</p></div><div className="metric-grid"><div><span>Daily configuration</span><b>{formatMoney(p.incomeConfiguration.daily,currency)}</b></div><div><span>Package duration</span><b>{p.cycleDays} days</b></div><div><span>Sort order</span><b>#{p.sortOrder}</b></div></div><Button disabled={p.status!=='ACTIVE'} onClick={()=>nav(`/deposit?packageId=${p._id}`)}>Deposit & Activate <ArrowRight size={15}/></Button></Card></div></Shell>}

export function DepositHistory(){const currency=useCurrency();const [items,setItems]=useState<Deposit[]>([]),[q,setQ]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState('');const load=()=>{setError('');depositService.getDeposits().then(setItems).catch(e=>setError(e.message||'Unable to load deposits.'))};useEffect(()=>{void load()},[]);const filtered=items.filter(x=>(!status||x.status===status)&&(x.transactionId+x.method+(x.packageName||'')+(x.reference||'')).toLowerCase().includes(q.toLowerCase()));return <Shell eyebrow="FUNDING" title="Deposit History" description="Track submitted deposits and their server-controlled verification state."><Card><div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="Search deposit ID, reference or methodâ€¦"/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option>PENDING</option><option>PROCESSING</option><option>COMPLETED</option><option>REJECTED</option><option>FAILED</option><option>CANCELLED</option></select><Button variant="ghost" onClick={load}><RefreshCw size={14}/>Refresh</Button></div>{error&&<p className="error">{error}</p>}{filtered.length?<Table headers={['Transaction','Package','Amount','Method','Status','Date']}>{filtered.map(d=><tr key={d._id}><td><b>{d.transactionId}</b><small>{d.reference||'â€”'}</small></td><td>{d.packageName||'â€”'}</td><td>{formatMoney(d.amount,currency)}</td><td>{d.method}</td><td><StatusBadge status={d.status}/></td><td>{new Date(d.createdAt).toLocaleDateString()}</td></tr>)}</Table>:<PageState type="empty" message="No deposits match your filters."/>}</Card></Shell>}

export function Withdrawal(){
  const currency=useCurrency();

  const [amount,setAmount]=useState(''),
    [method,setMethod]=useState(''),
    [account,setAccount]=useState(''),
    [accountHolderName,setAccountHolderName]=useState(''),
    [settings,setSettings]=useState<PlatformSettings|null>(null),
    [methods,setMethods]=useState<PaymentMethod[]>([]),
    [balance,setBalance]=useState<number|null>(null),
    [done,setDone]=useState(''),
    [error,setError]=useState(''),
    [submitting,setSubmitting]=useState(false),
    [eligible,setEligible]=useState(true),
    [nextWithdrawalAt,setNextWithdrawalAt]=useState<string|null>(null),
    [countdown,setCountdown]=useState(''),
    [eligibilityLoading,setEligibilityLoading]=useState(true);

  const load=()=>{
    Promise.all([
      getCachedSettings(),
      paymentMethodService.getMethods(),
      dashboardService.getDashboard()
    ])
      .then(([s,m,d])=>{
        setSettings(s);
        setMethods(m);
        setMethod(m[0]?.code||'');
        setBalance(d.availableBalance);
      })
      .catch(e=>setError(e.message||'Unable to load withdrawal settings.'));
  };

  const loadEligibility=async()=>{
    try{
      const data=await withdrawalService.getWithdrawalEligibility();

      setEligible(Boolean(data.eligible));
      setNextWithdrawalAt(data.nextWithdrawalAt||null);
      setEligibilityLoading(false);
    }catch(e){
      const err=e as Error;
      setEligibilityLoading(false);
      setError(err.message||'Unable to check withdrawal availability.');
    }
  };

  useEffect(()=>{
    void load();
    void loadEligibility();

    const interval=window.setInterval(()=>{
      void loadEligibility();
    },30000);

    return()=>window.clearInterval(interval);
  },[]);

  useEffect(()=>{
    const updateCountdown=()=>{
      if(!nextWithdrawalAt){
        setCountdown('');
        return;
      }

      const remaining=Math.max(
        0,
        new Date(nextWithdrawalAt).getTime()-Date.now()
      );

      if(remaining<=0){
        setCountdown('');
        setEligible(true);
        void loadEligibility();
        return;
      }

      const totalMinutes=Math.ceil(remaining/60000);
      const days=Math.floor(totalMinutes/(60*24));
      const hours=Math.floor((totalMinutes%(60*24))/60);
      const minutes=totalMinutes%60;

      if(days>0){
        setCountdown(`${days}d ${hours}h ${minutes}m`);
      }else if(hours>0){
        setCountdown(`${hours}h ${minutes}m`);
      }else{
        setCountdown(`${minutes}m`);
      }
    };

    updateCountdown();

    const timer=window.setInterval(updateCountdown,1000);

    return()=>window.clearInterval(timer);
  },[nextWithdrawalAt]);

  const n=Number(amount)||0,
    fee=n*(settings?.withdrawalFeePercent||0)/100,
    net=Math.max(0,n-fee);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();

    if(!eligible){
      setError(
        countdown
          ? `Next withdrawal available in ${countdown}.`
          : 'Withdrawal is currently unavailable.'
      );
      return;
    }

    setSubmitting(true);
    setDone('');
    setError('');

    try{
      const r=await withdrawalService.createWithdrawal({
        amount:n,
        method,
        account,
        accountHolderName
      });

      setDone(r.message);
      setAmount('');
      setAccountHolderName('');

      const d=await dashboardService.getDashboard();
      setBalance(d.availableBalance);

      await loadEligibility();
    }catch(x){
      const e=x as Error;
      setError(e.message||'Unable to submit withdrawal.');
      await loadEligibility();
    }finally{
      setSubmitting(false);
    }
  };

  return <Shell
    eyebrow="PAYOUT"
    title="Withdrawal"
    description="Request a payout from your available balance. Fees are recalculated by the backend."
  >
    <div className="grid2">
      <Card>
        <form onSubmit={submit} className="form-grid">

          <div className="notice">
            <b>Withdrawal availability</b>
            <br/>
            Withdrawal window: <strong>10:00 AM – 5:00 PM</strong> Pakistan time.
            <br/>
            One withdrawal is allowed every <strong>24 hours</strong>.
            <br/><br/>

            {eligibilityLoading ? (
              <span>Checking withdrawal availability...</span>
            ) : eligible ? (
              <span className="success">✅ Withdrawal available</span>
            ) : (
              <span className="error">
                🔒 Next withdrawal available in <strong>{countdown||'calculating...'}</strong>
              </span>
            )}
          </div>

          <Field
            label="Amount"
            hint={`Minimum: ${formatMoney(settings?.minimumWithdrawal||1,settings?.currency||currency)}`}
          >
            <input
              type="number"
              min={settings?.minimumWithdrawal||1}
              step="0.01"
              value={amount}
              onChange={e=>setAmount(e.target.value)}
              required
            />
          </Field>

          <Field label="Payment method">
            <select
              value={method}
              onChange={e=>setMethod(e.target.value)}
              required
            >
              {methods.map(m=>
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              )}
            </select>
          </Field>

          <Field label="Account holder name">
            <input
              value={accountHolderName}
              onChange={e=>setAccountHolderName(e.target.value)}
              placeholder="Account holder name"
              required
              minLength={2}
            />
          </Field>

          <Field label="Account number / destination">
            <input
              value={account}
              onChange={e=>setAccount(e.target.value)}
              placeholder="Wallet / account / IBAN"
              required
              minLength={2}
            />
          </Field>

          <div className="notice">
            <b>Important</b>
            <br/>
            Please enter the correct account number and the correct account holder name.
            The funds will be sent according to the account number and name provided by you.
            If you provide an incorrect account number or incorrect account holder name and
            the funds are transferred incorrectly, the member will be responsible for the error.
            The company will not be responsible for incorrect information provided by the member.
            <br/><br/>
            ???? ???? ???? ?????? ???? ??? ?????? ????? ?? ???? ??? ??? ???? ??? ??? ????? ???? ????
            ??? ??? ?? ????? ????????? ??? ??? ???? ?? ??? ?? ??? ???? ?? ??? ??? ??? ??? ??? ??? ??? ???
            ?? ??? ?? ?? ?? ??? ???? ???? ?? ???? ????? ????? ?? ?? ??? ??? ???? ?????
          </div>

          {error&&<p className="error">{error}</p>}
          {done&&<p className="success">{done}</p>}

          <Button
            type="submit"
            loading={submitting}
            disabled={!method||!eligible||eligibilityLoading}
          >
            {eligibilityLoading
              ? 'Checking availability...'
              : eligible
                ? 'Request Withdrawal'
                : `Available in ${countdown||'...'}`}
            <Send size={15}/>
          </Button>

        </form>
      </Card>

      <Card>
        <span className="eyebrow">PAYOUT SUMMARY</span>

        <div className="summary large">
          <span>Available balance</span>
          <b>{formatMoney(balance??0,currency)}</b>

          <span>Requested</span>
          <b>{formatMoney(n,currency)}</b>

          <span>Fee ({settings?.withdrawalFeePercent||0}%)</span>
          <b>-{formatMoney(fee,currency)}</b>

          <span>Estimated net</span>
          <strong>{formatMoney(net,currency)}</strong>
        </div>

        <div className="notice">
          The preview is informational; the server validates balance,
          fee, minimum and withdrawal eligibility.
        </div>
      </Card>
    </div>
  </Shell>
}

export function WithdrawalHistory(){const currency=useCurrency();const [items,setItems]=useState<WithdrawalRecord[]>([]),[error,setError]=useState('');const load=async()=>{try{const data=await withdrawalService.getWithdrawals();setItems(data);setError('')}catch(e){const err=e as Error;setError(err.message||'Unable to load withdrawals.')}};useEffect(()=>{void load();const interval=window.setInterval(()=>{void load()},5000);return()=>window.clearInterval(interval)},[]);return <Shell eyebrow="PAYOUT" title="Withdrawal History" description="Review payout requests and their processing status."><Card>{error&&<p className="error">{error}</p>}{items.length?<Table headers={['Transaction','Amount','Fee','Net','Method','Status','Date']}>{items.map(w=><tr key={w._id}><td>{w.transactionId}</td><td>{formatMoney(w.amount,currency)}</td><td>{formatMoney(w.fee,currency)}</td><td>{formatMoney(w.netAmount,currency)}</td><td>{w.method}</td><td><StatusBadge status={w.status}/></td><td>{new Date(w.createdAt).toLocaleDateString()}</td></tr>)}</Table>:<PageState type="empty" message="No withdrawal requests yet."/>}</Card></Shell>}

export function Transactions(){const currency=useCurrency();const [items,setItems]=useState<Transaction[]>([]),[q,setQ]=useState(''),[type,setType]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);const requestSeq=useRef(0);const load=()=>{const seq=++requestSeq.current;setLoading(true);setError('');transactionService.getTransactions({q,type,status}).then(rows=>{if(seq===requestSeq.current)setItems(rows)}).catch(e=>{if(seq===requestSeq.current)setError(e.message||'Unable to load transactions.')}).finally(()=>{if(seq===requestSeq.current)setLoading(false)})};useEffect(()=>{const timer=window.setTimeout(()=>{void load()},300);return()=>window.clearTimeout(timer)},[q,type,status]);return <Shell eyebrow="LEDGER" title="Transaction History" description="Unified, traceable financial events returned by the ledger service."><Card><div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="Search transactionâ€¦"/><div className="filter-row"><select value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{['DEPOSIT','PACKAGE_PURCHASE','PACKAGE_INCOME','WITHDRAWAL','WITHDRAWAL_FEE','COMMISSION','REWARD','PROMO_REWARD','ADJUSTMENT','REFUND','REVERSAL'].map(x=><option key={x} value={x}>{x}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{['COMPLETED','PENDING','PROCESSING','REJECTED','APPROVED','FAILED'].map(x=><option key={x} value={x}>{x}</option>)}</select></div><Button variant="ghost" onClick={load}><RefreshCw size={14}/>Refresh</Button></div>{error&&<p className="error">{error}</p>}{loading&&items.length===0?<div className="skeleton" style={{height:180,width:'100%'}}/>:items.length?<Table headers={['ID','Type','Amount','Fee','Net','Status','Date']}>{items.map(t=><tr key={t._id}><td><b>{t.transactionId}</b><small>{t.description||'Ledger event'}</small></td><td>{t.type}</td><td>{formatMoney(t.amount,currency)}</td><td>{formatMoney(t.fee,currency)}</td><td>{formatMoney(t.netAmount,currency)}</td><td><StatusBadge status={t.status}/></td><td>{new Date(t.createdAt).toLocaleDateString()}</td></tr>)}</Table>:<PageState type="empty" message="No transactions found."/>}</Card></Shell>}

export function Team(){const currency=useCurrency();
  const [members,setMembers]=useState<TeamMember[]>([]),
    [summary,setSummary]=useState<{
      directMembers:number; indirectTeam:number; totalTeam:number; activeTeam:number;
      selfBusiness:number; directBusiness:number; indirectBusiness:number; totalBusiness:number; commission:number;
    }|null>(null),
    [ref,setRef]=useState<{link:string;code:string;levels:number[]}|null>(null),
    [copied,setCopied]=useState(false),[error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    const apply=(a:any)=>{
      if(!active)return;
      setMembers(a?.members||[]);
      setSummary(a?.summary||null);
      setRef(a?.referral||null);
    };
    if(teamCache && Date.now()-teamCacheAt<TEAM_CACHE_MS){
      apply(teamCache);
      return()=>{active=false};
    }
    teamService.getTeam().then(a=>{
      teamCache=a;
      teamCacheAt=Date.now();
      apply(a);
    }).catch(e=>{if(active)setError(e.message||'Unable to load team.')});
    return()=>{active=false};
  },[]);

  const copy=()=>{
    if(ref?.link)navigator.clipboard?.writeText(ref.link).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1200)}).catch(()=>setError('Clipboard access is unavailable.'));
  };
  const s=summary||{directMembers:0,indirectTeam:0,totalTeam:0,activeTeam:0,selfBusiness:0,directBusiness:0,indirectBusiness:0,totalBusiness:0,commission:0};

  return <Shell eyebrow="NETWORK" title="My Team" description="Complete team structure, business volume and referral network overview.">
    {error&&<p className="error">{error}</p>}
    <div className="grid2">
      <Card><span className="eyebrow">REFERRAL LINK</span><div className="ref-link"><input readOnly value={ref?.link||''}/><Button onClick={copy} disabled={!ref?.link}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy'}</Button></div><div className="stats mini-stats">{(ref?.levels||[]).map((r,i)=><div key={i}><b>{r}%</b><span>Level {i+1}</span></div>)}</div></Card>
      <Card><span className="eyebrow">TEAM OVERVIEW</span><div className="metric-grid"><div><span>Direct Members</span><b>{s.directMembers}</b></div><div><span>Indirect Team</span><b>{s.indirectTeam}</b></div><div><span>Total Team</span><b>{s.totalTeam}</b></div><div><span>Active Team</span><b>{s.activeTeam}</b></div></div></Card>
    </div>
    <Card><span className="eyebrow">BUSINESS OVERVIEW</span><div className="metric-grid"><div><span>Self Business</span><b>{formatMoney(s.selfBusiness,currency)}</b></div><div><span>Direct Business</span><b>{formatMoney(s.directBusiness,currency)}</b></div><div><span>Indirect Business</span><b>{formatMoney(s.indirectBusiness,currency)}</b></div><div><span>Total Business</span><b>{formatMoney(s.totalBusiness,currency)}</b></div><div><span>Team Commission</span><b>{formatMoney(s.commission,currency)}</b></div></div></Card>
    <Card><div className="card-head"><div><h3>Team members</h3><span>Direct and indirect members with their current business and commission details.</span></div></div>{members.length?<Table headers={['User','Level','Status','Joined','Business','Commission']}>{members.map(m=><tr key={m._id}><td><b>{m.name}</b><small>{m.userId}</small></td><td>L{m.level}</td><td><StatusBadge status={m.status}/></td><td>{new Date(m.joinedAt).toLocaleDateString()}</td><td>{formatMoney(m.volume,currency)}</td><td>{formatMoney(m.commission,currency)}</td></tr>)}</Table>:<div className="muted-copy">Team data will appear here.</div>}</Card>
  </Shell>
}
export function Rewards(){const currency=useCurrency();const [tiers,setTiers]=useState<RewardTier[]>([]),[progress,setProgress]=useState(0),[claimed,setClaimed]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');const load=()=>{setError('');Promise.all([rewardService.getRewards(),rewardService.getStatus()]).then(([a,b])=>{setTiers(a);setProgress(Number(b.qualifyingVolume||0));setClaimed(b.claimedRewardIds||[])}).catch(e=>setError(e.message||'Unable to load rewards.'))};useEffect(()=>{void load()},[]);const claim=async(id:string)=>{setBusy(id);setError('');try{await rewardService.claimReward(id);setClaimed(x=>[...x,id]);await load()}catch(e){setError((e as Error).message||'Reward claim failed.')}finally{setBusy('')}};return <Shell eyebrow="REWARDS" title="Ring Rewards" description="Reward tiers and qualification state are configuration-driven.">{error&&<p className="error">{error}</p>}<div className="reward-grid">{tiers.map(t=>{const eligible=progress>=t.threshold,already=claimed.includes(t._id);return <Card key={t._id} className="reward-card"><div className="card-head"><span className="mini">TIER</span><StatusBadge status={t.status}/></div><h2>{formatMoney(t.reward,currency)}</h2><p>Threshold: {formatMoney(t.threshold,currency)}</p><Progress value={Math.min(100,(progress/t.threshold)*100)}/><div className="cycle-meta"><span>Progress</span><b>{formatMoney(Math.min(progress,t.threshold),currency)} / {formatMoney(t.threshold,currency)}</b></div><Button variant="ghost" disabled={!eligible||already} loading={busy===t._id} onClick={()=>claim(t._id)}>{already?'Claimed':eligible?'Claim reward':'View progress'}</Button></Card>})}</div><Card><h3>Qualifying volume</h3><p className="muted-copy">Completed qualifying deposits: {formatMoney(progress,currency)}. Rewards are not calculated from withdrawals, income or unrelated ledger events.</p></Card></Shell>}

export function Promo(){const currency=useCurrency();const [code,setCode]=useState(''),[result,setResult]=useState<{code:string;rewardType:string;rewardValue:number}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[history,setHistory]=useState<string[]>([]);const apply=async()=>{if(!code.trim()){setError('Enter a promo code.');return}setLoading(true);setError('');try{const r=await promoService.applyPromo(code.trim());const applied={code:String(r.code),rewardType:String(r.rewardType),rewardValue:Number(r.rewardValue)};setResult(applied);setHistory(h=>[applied.code,...h.filter(x=>x!==applied.code)]);setCode('')}catch(e){setResult(null);setError((e as Error).message||'Promo code could not be applied.')}finally{setLoading(false)}};return <Shell eyebrow="PROMOTIONS" title="Promo Code" description="Validate and apply promotion codes through the service layer."><div className="grid2"><Card><div className="inline-form"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ENTER PROMO CODE"/><Button onClick={apply} loading={loading}>Apply</Button></div>{error&&<p className="error">{error}</p>}{result&&<div className="success-box"><CheckCircle/><div><b>{result.code} applied</b><span>Reward: {result.rewardType} {formatMoney(result.rewardValue,currency)}</span></div></div>}</Card><Card><span className="eyebrow">PROMO HISTORY</span>{history.length?history.map(x=><div className="list-row" key={x}><b>{x}</b><StatusBadge status="COMPLETED"/></div>):<div className="empty">No promo codes used yet.</div>}</Card></div></Shell>}
export function Profile(){const {user:authUser}=useAuth();const [user,setUser]=useState<User|null>(authUser),[fullName,setFullName]=useState(authUser?.fullName||''),[phone,setPhone]=useState(authUser?.phone||''),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
useEffect(()=>{if(authUser){setUser(authUser);setFullName(authUser.fullName);setPhone(authUser.phone||'')}},[authUser]);
const save=async(e:FormEvent)=>{e.preventDefault();setSaving(true);setError('');setMessage('');try{const u=await userService.updateProfile({fullName,phone});setUser(u);setMessage('Profile updated successfully.')}catch(e){setError((e as Error).message||'Unable to save profile.')}finally{setSaving(false)}};
if(!user)return <Shell eyebrow="ACCOUNT" title="My Profile" description="Account identity and referral information."><Card><div className="muted-copy">Account information will appear here.</div></Card></Shell>;
return <Shell eyebrow="ACCOUNT" title="My Profile" description="Account identity and referral information."><Card><form onSubmit={save} className="profile-grid"><Field label="Full name"><input value={fullName} onChange={e=>setFullName(e.target.value)} required minLength={2}/></Field><Field label="Username"><input value={user.username} readOnly/></Field><Field label="Email"><input value={user.email} readOnly type="email"/></Field><Field label="Phone"><input value={phone} onChange={e=>setPhone(e.target.value)}/></Field><Field label="User ID"><input value={user.userId} readOnly/></Field><Field label="Referral code"><input value={user.referralCode} readOnly/></Field><div className="full">{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}<Button type="submit" loading={saving}>Save profile</Button></div></form></Card></Shell>}
export function Settings(){const [s,setS]=useState<PlatformSettings|null>(null),[error,setError]=useState(''),[telegramCode,setTelegramCode]=useState(''),[telegramBusy,setTelegramBusy]=useState(false);const load=()=>getCachedSettings().then(setS).catch(e=>setError(e.message||'Unable to load settings.'));useEffect(()=>{void load()},[]);const generateTelegramCode=async()=>{setTelegramBusy(true);setError('');try{const r=await telegramService.linkCode();setTelegramCode(r.code)}catch(e){setError((e as Error).message||'Unable to create Telegram link code.')}finally{setTelegramBusy(false)}};const unlinkTelegram=async()=>{setTelegramBusy(true);setError('');try{await telegramService.unlink();setTelegramCode('')}catch(e){setError((e as Error).message||'Unable to unlink Telegram.')}finally{setTelegramBusy(false)}};
return <Shell eyebrow="PREFERENCES" title="Settings" description="Centralized platform settings displayed from the settings service.">{error&&<p className="error">{error}</p>}<div className="grid2"><Card><h3>Account security</h3><div className="settings-row"><span>Two-factor authentication</span><StatusBadge status="NOT_CONFIGURED"/></div><div className="settings-row"><span>Session security</span><StatusBadge status="ACTIVE"/></div><Button variant="ghost" disabled>Change password unavailable</Button></Card><Card><h3>Platform defaults</h3>{s?<div className="settings-list"><div><span>Currency</span><b>{s.currency}</b></div><div><span>Minimum deposit</span><b>{formatMoney(s.minimumDeposit,s.currency)}</b></div><div><span>Minimum withdrawal</span><b>{formatMoney(s.minimumWithdrawal,s.currency)}</b></div><div><span>Withdrawal fee</span><b>{s.withdrawalFeePercent}%</b></div><div><span>Cycle interval</span><b>{s.cycleIntervalHours||24} hours</b></div><div><span>Package duration</span><b>{s.packageDurationDays||365} days</b></div></div>:<div className="muted-copy">Platform defaults are loading in the background.</div>}</Card><Card><h3>Telegram notifications</h3><p className="muted-copy">Securely link Telegram using a short-lived one-time code. Never share passwords or session tokens.</p>{telegramCode&&<div className="instruction"><b>One-time code</b><code>{telegramCode}</code><small>Send this code to the configured TRUST MINE Telegram bot using /link.</small></div>}<div className="actions"><Button variant="ghost" loading={telegramBusy} onClick={generateTelegramCode}>Generate link code</Button><Button variant="ghost" loading={telegramBusy} onClick={unlinkTelegram}>Unlink Telegram</Button></div></Card></div></Shell>}
export function Notifications(){const [items,setItems]=useState<Notification[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');const load=()=>notificationService.getNotifications().then(setItems).catch(e=>setError(e.message||'Unable to load notifications.'));useEffect(()=>{void load()},[]);const read=async(id:string)=>{setBusy(id);try{await notificationService.markRead(id);setItems(x=>x.map(n=>n._id===id?{...n,read:true}:n))}catch(e){setError((e as Error).message||'Unable to mark notification read.')}finally{setBusy('')}};return <Shell eyebrow="ALERTS" title="Notifications" description="Deposit, package, reward and system notifications ready for backend delivery.">{error&&<p className="error">{error}</p>}<Card>{items.length?items.map(n=><div className={`notification ${n.read?'read':''}`} key={n._id}><div className="notification-dot"/><div><b>{n.title}</b><p>{n.message}</p><small>{new Date(n.createdAt).toLocaleString()}</small></div>{n.read?<StatusBadge status="READ"/>:<Button variant="ghost" loading={busy===n._id} onClick={()=>read(n._id)}>Mark read</Button>}</div>):<PageState type="empty" message="You have no notifications."/>}</Card></Shell>}

export function Activity(){return <Shell eyebrow="SECURITY" title="Activity History" description="Account activity history is not currently exposed by the backend."><Card><div className="empty">Activity history is currently unavailable. No simulated or placeholder security events are shown.</div></Card></Shell>}

export function Support(){
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [selected,setSelected]=useState<SupportTicket|null>(null);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [subject,setSubject]=useState('');
  const [message,setMessage]=useState('');
  const [reply,setReply]=useState('');
  const [done,setDone]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [messagesLoading,setMessagesLoading]=useState(false);
  const [sending,setSending]=useState(false);

  const normalizeTickets=(value:any):SupportTicket[]=>{
    if(Array.isArray(value)) return value;
    if(Array.isArray(value?.tickets)) return value.tickets;
    if(Array.isArray(value?.data)) return value.data;
    if(Array.isArray(value?.data?.tickets)) return value.data.tickets;
    return [];
  };

  const normalizeMessages=(value:any):SupportMessage[]=>{
    const raw=Array.isArray(value)
      ? value
      : Array.isArray(value?.messages)
        ? value.messages
        : Array.isArray(value?.data)
          ? value.data
          : Array.isArray(value?.data?.messages)
            ? value.data.messages
            : [];

    return raw
      .map((item:any)=>{
        const nested=item?.message;

        return {
          ...item,
          message:
            typeof nested==='string'
              ? nested
              : typeof nested?.message==='string'
                ? nested.message
                : String(nested??'')
        };
      })
      .filter((item:any)=>item?._id);
  };

  const loadTickets=async()=>{
    try{
      const data=await supportService.getTickets();
      const normalized=normalizeTickets(data);

      setTickets(normalized);

      setSelected(current=>{
        if(!current) return current;

        const fresh=normalized.find(
          (t:SupportTicket)=>t._id===current._id
        );

        return fresh||null;
      });
    }catch(e){
      setError(
        (e as Error).message||
        'Unable to load tickets.'
      );
    }finally{
      setLoading(false);
    }
  };

  const loadMessages=async(
    ticketId:string,
    markRead=true
  )=>{
    setMessagesLoading(true);

    try{
      const data=await supportService.getMessages(ticketId);
      const normalized=normalizeMessages(data);

      setMessages(normalized);

      if(markRead){
        await supportService.markRead(ticketId);

        setTickets(x=>
          x.map(t=>
            t._id===ticketId
              ? {...t,unreadForUser:0}
              : t
          )
        );
      }
    }catch(e){
      setError(
        (e as Error).message||
        'Unable to load support messages.'
      );
    }finally{
      setMessagesLoading(false);
    }
  };

  useEffect(()=>{
    void loadTickets();

    const timer=window.setInterval(()=>{
      void loadTickets();
    },10000);

    return ()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    if(!selected) return;

    void loadMessages(selected._id);

    const timer=window.setInterval(()=>{
      void loadMessages(selected._id,false);
    },5000);

    return ()=>window.clearInterval(timer);
  },[selected?._id]);

  const selectTicket=async(t:SupportTicket)=>{
    setSelected(t);
    setError('');
    await loadMessages(t._id,true);
  };

  const submit=async(e:FormEvent)=>{
    e.preventDefault();

    setLoading(true);
    setError('');
    setDone('');

    try{
      const response=await supportService.createTicket({
        subject,
        message
      });

      const created=(
        response?.ticket||
        response?.data?.ticket||
        response?.data||
        response
      );

      setTickets(x=>[
        created,
        ...(Array.isArray(x)?x:[])
      ]);

      setSelected(created);
      setSubject('');
      setMessage('');
      setDone('Ticket created successfully.');

      await loadMessages(created._id,true);
    }catch(e){
      setError(
        (e as Error).message||
        'Unable to create ticket.'
      );
    }finally{
      setLoading(false);
    }
  };

  const sendReply=async()=>{
    if(
      !selected||
      !reply.trim()||
      selected.status==='RESOLVED'
    ){
      return;
    }

    setSending(true);
    setError('');
    setDone('');

    try{
      await supportService.sendMessage(
        selected._id,
        reply.trim()
      );

      setReply('');

      await loadMessages(selected._id,false);
      await loadTickets();
    }catch(e){
      setError(
        (e as Error).message||
        'Unable to send reply.'
      );
    }finally{
      setSending(false);
    }
  };

  return (
    <Shell
      eyebrow="HELP"
      title="Support"
      description="FAQs, contact support and ticket history."
    >
      {error&&<p className="error">{error}</p>}
      {done&&<p className="success">{done}</p>}

      <div className="grid2">

        <Card>
          <h3>Frequently asked</h3>

          <div className="faq">
            <details>
              <summary>
                When does a package cycle start?
              </summary>
              <p>
                After backend verification marks the
                associated deposit completed, activation
                and cycle timestamps are created server-side.
              </p>
            </details>

            <details>
              <summary>
                Can I activate a package manually?
              </summary>
              <p>
                No. The intended architecture automatically
                activates it after verified payment.
              </p>
            </details>

            <details>
              <summary>
                Are dashboard timers authoritative?
              </summary>
              <p>
                No. They are presentation-only and never
                credit financial value.
              </p>
            </details>
          </div>
        </Card>

        <Card>
          <h3>Customer Support</h3>

          <p className="muted-copy">
            Contact TRUST MINE through our support channels
            or start a conversation with support.
          </p>

          <div
            className="actions"
            style={{marginBottom:'18px'}}
          >
            <a
              className="btn"
              href="https://whatsapp.com/channel/0029Vb8r8KN4dTnFwnDT2J0D"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp Channel
            </a>

            <a
              className="btn"
              href="https://wa.me/923153430862"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp Contact
            </a>

            <a
              className="btn"
              href="https://t.me/trustmine_demo"
              target="_blank"
              rel="noreferrer"
            >
              Telegram
            </a>
          </div>

          <p className="muted-copy">
            WhatsApp contact and Telegram links are temporary
            placeholders and can be replaced with the official
            accounts later.
          </p>

          <hr/>

          <h3>Create support ticket</h3>

          <form
            onSubmit={submit}
            className="form-grid"
          >
            <Field label="Subject">
              <input
                value={subject}
                onChange={e=>setSubject(e.target.value)}
                required
              />
            </Field>

            <Field label="Message">
              <textarea
                value={message}
                onChange={e=>setMessage(e.target.value)}
                required
                rows={5}
              />
            </Field>

            <Button
              type="submit"
              loading={loading}
            >
              Create Ticket <LifeBuoy size={15}/>
            </Button>
          </form>
        </Card>

      </div>

      <Card>
        <h3>Ticket history</h3>

        {loading ? (
          <div className="empty">
            Loading support tickets...
          </div>
        ) : tickets.length ? (

          <Table
            headers={[
              'Subject',
              'Status',
              'Created'
            ]}
          >
            {tickets.map(t=>(
              <tr
                key={t._id}
                onClick={()=>selectTicket(t)}
                style={{
                  cursor:'pointer',
                  background:
                    selected?._id===t._id
                      ?'rgba(255,255,255,0.04)'
                      :undefined
                }}
              >
                <td>
                  <b>{t.subject}</b>

                  <small>
                    {t.lastMessagePreview||t.message}
                  </small>

                  {(t.unreadForUser||0)>0&&(
                    <small>
                      {t.unreadForUser} new message
                      {(t.unreadForUser||0)>1?'s':''}
                    </small>
                  )}
                </td>

                <td>
                  <StatusBadge status={t.status}/>
                </td>

                <td>
                  {new Date(
                    t.createdAt
                  ).toLocaleString()}
                </td>
              </tr>
            ))}
          </Table>

        ) : (
          <div className="empty">
            No support tickets yet.
          </div>
        )}
      </Card>

      {selected&&(
        <Card>
          <div
            style={{
              display:'flex',
              justifyContent:'space-between',
              alignItems:'center',
              gap:'12px',
              marginBottom:'16px'
            }}
          >
            <div>
              <h3>{selected.subject}</h3>

              <small className="muted-copy">
                {selected.status}
              </small>
            </div>

            <Button
              variant="ghost"
              onClick={()=>{
                void loadMessages(selected._id);
              }}
            >
              Refresh
            </Button>
          </div>

          <div
            style={{
              display:'flex',
              flexDirection:'column',
              gap:'12px',
              marginBottom:'18px'
            }}
          >
            {messagesLoading&&messages.length===0 ? (
              <div className="empty">
                Loading messages...
              </div>
            ) : messages.length===0 ? (
              <div className="empty">
                No messages yet.
              </div>
            ) : (
              messages.map((m,index)=>(
                <div
                  key={`${m._id}-${index}`}
                  style={{
                    padding:'12px 14px',
                    borderRadius:'12px',
                    border:'1px solid rgba(255,255,255,0.08)',
                    alignSelf:
                      m.senderRole==='USER'
                        ?'flex-end'
                        :'flex-start',
                    maxWidth:'80%'
                  }}
                >
                  <strong>
                    {m.senderRole==='USER'
                      ?'You'
                      :'Support Admin'}
                  </strong>

                  <p style={{margin:'6px 0'}}>
                    {m.message}
                  </p>

                  <small className="muted-copy">
                    {new Date(
                      m.createdAt
                    ).toLocaleString()}
                  </small>
                </div>
              ))
            )}
          </div>

          {selected.status==='RESOLVED' ? (
            <div className="empty">
              This conversation is resolved.
              Please create a new ticket if you need
              further assistance.
            </div>
          ) : (
            <div className="form-grid">

              <Field label="Reply to support">
                <textarea
                  value={reply}
                  onChange={e=>setReply(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="Write your reply..."
                />
              </Field>

              <Button
                type="button"
                loading={sending}
                disabled={!reply.trim()}
                onClick={sendReply}
              >
                Send Reply
              </Button>

            </div>
          )}
        </Card>
      )}
    </Shell>
  );
}



