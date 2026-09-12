import {formatMoney} from '../config/currency';
import AdminSupport from '../components/AdminSupport';
import {FormEvent,ReactNode,useEffect,useState} from 'react';
import {adminService} from '../services';
import type {AdminDashboardData,Deposit,PackagePlan,PaymentMethod,PromoCode,RewardTier,Transaction,User,Withdrawal,PlatformSettings} from '../types';
import {Card,StatCard,StatusBadge,Button,PageState,SearchBar,Modal,Field} from '../components/ui';
import {Users,Wallet,ArrowDownToLine,Boxes,ShieldCheck,Settings,Gift,ReceiptText,SlidersHorizontal,Plus,Check,X,RefreshCw} from 'lucide-react';

const tabs=[
  ['overview','Dashboard'],
  ['users','Users'],
  ['packages','Packages'],
  ['deposits','Deposits'],
  ['withdrawals','Withdrawals'],
  ['transactions','Transactions'],
  ['payments','Payment Methods'],
  ['promos','Promo Codes'],
  ['rewards','Rewards'],
  ['settings','Platform Settings'],
  ['support','Live Support']
];

function Table({
  headers,
  children,
  minWidth=800
}:{
  headers:string[];
  children:ReactNode;
  minWidth?:number
}){
  return (
    <div className="table-wrap">
      <table style={{minWidth}}>
        <thead>
          <tr>
            {headers.map(h=><th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function FormModal({
  kind,
  editing,
  onClose,
  onSaved
}:{
  kind:'package'|'payment'|'promo'|'reward';
  editing?:PackagePlan|PaymentMethod|PromoCode|RewardTier;
  onClose:()=>void;
  onSaved:()=>Promise<void>
}){
  const [form,setForm]=useState<Record<string,string|undefined>>(()=>{
    if(kind==='package'){
      const p=editing as PackagePlan|undefined;
      return {
        name:p?.name||'',
        amount:String(p?.amount??''),
        dailyIncome:String(p?.incomeConfiguration?.daily??''),
        cycleDays:String(p?.cycleDays??365),
        sortOrder:String(p?.sortOrder??0),
        status:p?.status||'ACTIVE',
        description:p?.description||'',
        image:p?.image||''
      };
    }

    if(kind==='payment'){
      const p=editing as PaymentMethod|undefined;
      return {
        code:p?.code||'',
        name:p?.name||'',
        minAmount:String(p?.minAmount??2),
        displayOrder:String(p?.displayOrder??0),
        status:p?.status||'ACTIVE',
        verificationMode:p?.verificationMode||'MANUAL',
        instructions:p?.instructions||'',
        accountDetails:p?.accountDetails||''
      };
    }

    if(kind==='promo'){
      const p=editing as PromoCode|undefined;
      return {
        code:p?.code||'',
        rewardType:p?.rewardType||'FIXED',
        rewardValue:String(p?.rewardValue??''),
        usageLimit:String(p?.usageLimit??''),
        perUserLimit:String(p?.perUserLimit??''),
        minRequirement:String(p?.minRequirement??''),
        expiresAt:p?.expiresAt ? new Date(p.expiresAt).toISOString().slice(0,16) : '',
        status:p?.status||'ACTIVE'
      };
    }

    const r=editing as RewardTier|undefined;

    return {
      threshold:String(r?.threshold??''),
      reward:String(r?.reward??''),
      sortOrder:String(r?.sortOrder??0),
      status:r?.status||'ACTIVE'
    };
  });

  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);

  const value=(key:string)=>form[key]??'';

  const set=(key:string,v:string)=>{
    setForm(x=>({...x,[key]:v}));
  };

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setSaving(true);
    setError('');

    try{
      if(kind==='package'){
        const data={
          name:value('name'),
          amount:Number(value('amount')),
          cycleDays:Number(value('cycleDays')),
          incomeConfiguration:{
            daily:Number(value('dailyIncome'))
          },
          sortOrder:Number(value('sortOrder')),
          status:value('status') as PackagePlan['status'],
          description:value('description'),
          image:value('image')||undefined
        };

        if(editing){
          await adminService.updatePackage(
            (editing as PackagePlan)._id,
            data
          );
        }else{
          await adminService.createPackage(data);
        }

      }else if(kind==='payment'){

        const data={
          code:value('code'),
          name:value('name'),
          minAmount:Number(value('minAmount')),
          displayOrder:Number(value('displayOrder')),
          status:value('status'),
          verificationMode:value('verificationMode') === 'AUTOMATIC' ? ('AUTOMATIC' as const) : ('MANUAL' as const),
          instructions:value('instructions'),
          accountDetails:value('accountDetails')
        };

        if(editing){
          await adminService.updatePaymentMethod(
            (editing as PaymentMethod)._id,
            data
          );
        }else{
          await adminService.createPaymentMethod(data);
        }

      }else if(kind==='promo'){

        const data={
          code:value('code'),
          rewardType:'FIXED',
          rewardValue:Number(value('rewardValue')),
          usageLimit:value('usageLimit') ? Number(value('usageLimit')) : undefined,
          perUserLimit:value('perUserLimit') ? Number(value('perUserLimit')) : undefined,
          minRequirement:value('minRequirement') ? Number(value('minRequirement')) : 0,
          status:value('status'),
          expiresAt:value('expiresAt') || undefined
        };

        if(editing){
          await adminService.updatePromo(
            (editing as PromoCode)._id,
            data
          );
        }else{
          await adminService.createPromo(data);
        }

      }else{

        const data={
          threshold:Number(value('threshold')),
          reward:Number(value('reward')),
          sortOrder:Number(value('sortOrder')),
          status:value('status') as RewardTier['status']
        };

        if(editing){
          await adminService.updateReward(
            (editing as RewardTier)._id,
            data
          );
        }else{
          await adminService.createReward(data);
        }
      }

      await onSaved();
      onClose();

    }catch(e){
      setError((e as Error).message||'Save failed');
    }finally{
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="form-grid">

      {kind==='package'&&<>
        <Field label="Name">
          <input
            value={value('name')}
            onChange={e=>set('name',e.target.value)}
            required
          />
        </Field>

        <Field label="Price">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={value('amount')}
            onChange={e=>set('amount',e.target.value)}
            required
          />
        </Field>

        <Field label="Daily income">
          <input
            type="number"
            min="0"
            step="0.00000001"
            value={value('dailyIncome')}
            onChange={e=>set('dailyIncome',e.target.value)}
            required
          />
        </Field>

        <Field label="Package duration (days)">
          <input
            type="number"
            min="1"
            step="1"
            value={value('cycleDays')}
            onChange={e=>set('cycleDays',e.target.value)}
            required
          />
        </Field>

        <Field label="Sort order">
          <input
            type="number"
            min="0"
            value={value('sortOrder')}
            onChange={e=>set('sortOrder',e.target.value)}
          />
        </Field>

        <Field label="Status">
          <select
            value={value('status')}
            onChange={e=>set('status',e.target.value)}
          >
            <option>ACTIVE</option>
            <option>DISABLED</option>
            <option>ARCHIVED</option>
          </select>
        </Field>

        <Field label="Description">
          <textarea
            value={value('description')}
            onChange={e=>set('description',e.target.value)}
            rows={4}
          />
        </Field>

        <Field label="Image URL">
          <input
            value={value('image')}
            onChange={e=>set('image',e.target.value)}
          />
        </Field>
      </>}

      {kind==='payment'&&<>
        <Field label="Code">
          <input
            value={value('code')}
            onChange={e=>set('code',e.target.value)}
            required
          />
        </Field>

        <Field label="Name">
          <input
            value={value('name')}
            onChange={e=>set('name',e.target.value)}
            required
          />
        </Field>

        <Field label="Minimum amount">
          <input
            type="number"
            min="0"
            step="0.01"
            value={value('minAmount')}
            onChange={e=>set('minAmount',e.target.value)}
          />
        </Field>

        <Field label="Display order">
          <input
            type="number"
            min="0"
            value={value('displayOrder')}
            onChange={e=>set('displayOrder',e.target.value)}
          />
        </Field>

        <Field label="Status">
          <select
            value={value('status')}
            onChange={e=>set('status',e.target.value)}
          >
            <option>ACTIVE</option>
            <option>DISABLED</option>
          </select>
        </Field>

        <Field label="Verification mode">
          <select
            value={value('verificationMode')}
            onChange={e=>set('verificationMode',e.target.value)}
          >
            <option>MANUAL</option>
            <option>AUTOMATIC</option>
          </select>
        </Field>

        <Field label="Instructions">
          <textarea
            value={value('instructions')}
            onChange={e=>set('instructions',e.target.value)}
            rows={4}
          />
        </Field>

        <Field label="Account details">
          <textarea
            value={value('accountDetails')}
            onChange={e=>set('accountDetails',e.target.value)}
            rows={3}
          />
        </Field>
      </>}

      {kind==='promo'&&<>
        <Field label="Code">
          <input
            value={value('code')}
            onChange={e=>set('code',e.target.value)}
            required
          />
        </Field>

        <Field label="Reward value">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={value('rewardValue')}
            onChange={e=>set('rewardValue',e.target.value)}
            required
          />
        </Field>

        <Field label="Usage limit">
          <input
            type="number"
            min="1"
            value={value('usageLimit')}
            onChange={e=>set('usageLimit',e.target.value)}
          />
        </Field>

        <Field label="Per-user limit">
          <input
            type="number"
            min="1"
            value={value('perUserLimit')}
            onChange={e=>set('perUserLimit',e.target.value)}
          />
        </Field>

        <Field label="Minimum requirement">
          <input
            type="number"
            min="0"
            step="0.01"
            value={value('minRequirement')}
            onChange={e=>set('minRequirement',e.target.value)}
          />
        </Field>

        <Field label="Expires at (optional)">
          <input
            type="datetime-local"
            value={value('expiresAt')}
            onChange={e=>set('expiresAt',e.target.value)}
          />
        </Field>

        <Field label="Status">
          <select
            value={value('status')}
            onChange={e=>set('status',e.target.value)}
          >
            <option>ACTIVE</option>
            <option>DISABLED</option>
          </select>
        </Field>
      </>}

      {kind==='reward'&&<>
        <Field label="Threshold">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={value('threshold')}
            onChange={e=>set('threshold',e.target.value)}
            required
          />
        </Field>

        <Field label="Reward">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={value('reward')}
            onChange={e=>set('reward',e.target.value)}
            required
          />
        </Field>

        <Field label="Sort order">
          <input
            type="number"
            min="0"
            value={value('sortOrder')}
            onChange={e=>set('sortOrder',e.target.value)}
          />
        </Field>

        <Field label="Status">
          <select
            value={value('status')}
            onChange={e=>set('status',e.target.value)}
          >
            <option>ACTIVE</option>
            <option>DISABLED</option>
          </select>
        </Field>
      </>}

      {error&&<p className="error">{error}</p>}

      <Button type="submit" loading={saving}>
        {editing?'Update':'Create'}
      </Button>
    </form>
  );
}

export default function Admin(){
  const [tab,setTab]=useState('overview');
  const [d,setD]=useState<AdminDashboardData|null>(null);
  const [users,setUsers]=useState<User[]>([]);
  const [packages,setPackages]=useState<PackagePlan[]>([]);
  const [deposits,setDeposits]=useState<Deposit[]>([]);
  const [withdrawals,setWithdrawals]=useState<Withdrawal[]>([]);
  const [transactions,setTransactions]=useState<Transaction[]>([]);
  const [methods,setMethods]=useState<PaymentMethod[]>([]);
  const [promos,setPromos]=useState<PromoCode[]>([]);
  const [rewards,setRewards]=useState<RewardTier[]>([]);
  const [settings,setSettings]=useState<PlatformSettings|null>(null);
  const [q,setQ]=useState('');
  const [modal,setModal]=useState<{
    kind:'package'|'payment'|'promo'|'reward';
    item?:PackagePlan|PaymentMethod|PromoCode|RewardTier
  }|null>(null);
  const [error,setError]=useState('');

  const load=async()=>{
    setError('');

    try{
      const [
        a,
        b,
        c,
        e,
        f,
        g,
        h,
        i,
        j,
        k
      ]=await Promise.all([
        adminService.getDashboard(),
        adminService.getUsers(),
        adminService.getPackages(),
        adminService.getDeposits(),
        adminService.getWithdrawals(),
        adminService.getTransactions(),
        adminService.getPaymentMethods(),
        adminService.getPromos(),
        adminService.getRewards(),
        adminService.getSettings()
      ]);

      setD(a);
      setUsers(b);
      setPackages(c);
      setDeposits(e);
      setWithdrawals(f);
      setTransactions(g);
      setMethods(h);
      setPromos(i);
      setRewards(j);
      setSettings(k);

    }catch(e){
      setError(
        (e as Error).message||
        'Admin data could not be loaded.'
      );
    }
  };

  useEffect(()=>{
    void load();
  },[]);

  if(!d){
    return (
      <div className="page">
        <PageState
          type={error?'error':'loading'}
          message={error||'Loading admin control center.'}
          onRetry={error?load:undefined}
        />
      </div>
    );
  }

  const filteredUsers=users.filter(u=>
    (u.fullName+u.email+u.userId)
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  return (
    <div className="page admin-page">

      <div className="page-head">
        <div>
          <span className="eyebrow">CONTROL CENTER</span>
          <h1>Admin Panel</h1>
          <p>
            Configuration and review workspace.
            Financial actions remain backend-authoritative.
          </p>
        </div>

        <div className="admin-badge">
          <ShieldCheck size={16}/>
          ADMIN
        </div>
      </div>

      <div className="admin-tabs">
        {tabs.map(([id,label])=>(
          <button
            key={id}
            className={tab===id?'active':''}
            onClick={()=>{
              setTab(id);
              setQ('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab==='overview'&&
        <Overview d={d} setTab={setTab} currency={settings?.currency||'USD'}/>
      }

      {tab==='users'&&
        <Card>
          <Toolbar q={q} setQ={setQ}/>

          <Table headers={['User','Role','Status','Referral','Joined','Actions']}>
            {filteredUsers.map(u=>(
              <tr key={u._id}>
                <td>
                  <b>{u.fullName}</b>
                  <small>{u.email} · {u.userId}</small>
                </td>

                <td>{u.role}</td>

                <td>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <StatusBadge status={u.status}/>

                    <button
                      type="button"
                      className="button"
                      onClick={async()=>{
                        try{
                          await adminService.updateUserStatus(
                            u._id,
                            u.status==='ACTIVE'
                              ? 'DISABLED'
                              : 'ACTIVE'
                          );
                          await load();
                        }catch(e){
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {u.status==='ACTIVE' ? 'Block' : 'Unblock'}
                    </button>
                  </div>
                </td>

                <td>{u.referralCode}</td>

                <td>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>

                <td>
                  {u.role==='USER'&&(
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button
                        type="button"
                        className="button"
                        onClick={async()=>{
                          const password=window.prompt(
                            `New password for ${u.email}:`
                          );

                          if(password===null){
                            return;
                          }

                          if(password.length<8){
                            window.alert(
                              'Password must be at least 8 characters.'
                            );
                            return;
                          }

                          try{
                            await adminService.changeUserPassword(
                              u._id,
                              password
                            );

                            window.alert(
                              'User password changed successfully.'
                            );
                          }catch(e){
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Change Password
                      </button>

                      {u.status==='ACTIVE'&&(
                        <button
                          type="button"
                          className="button"
                          onClick={async()=>{
                            if(!window.confirm(
                              `Login as ${u.fullName}?`
                            )){
                              return;
                            }

                            try{
                              const adminToken=
                                localStorage.getItem('tm_token');

                              if(!adminToken){
                                throw new Error(
                                  'Admin session token not found'
                                );
                              }

                              const r=
                                await adminService.loginAsUser(u._id);

                              sessionStorage.setItem(
                                'tm_admin_token',
                                adminToken
                              );

                              sessionStorage.setItem(
                                'tm_impersonated_user',
                                JSON.stringify({
                                  id:u._id,
                                  name:u.fullName,
                                  email:u.email
                                })
                              );

                              localStorage.setItem(
                                'tm_token',
                                r.token
                              );

                              window.location.href='/';
                            }catch(e){
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Login as User
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      }

      {tab==='packages'&&
        <CrudPackages
          items={packages}
          currency={settings?.currency||'USD'}
          onAdd={()=>setModal({kind:'package'})}
          onEdit={p=>setModal({kind:'package',item:p})}
          onArchive={async p=>{
            try{
              await adminService.archivePackage(p._id);
              await load();
            }catch(e){
              setError((e as Error).message);
            }
          }}
        />
      }

      {tab==='deposits'&&
        <ReviewDeposits
          items={deposits}
          currency={settings?.currency||'USD'}
          refresh={load}
        />
      }

      {tab==='withdrawals'&&
        <ReviewWithdrawals
          items={withdrawals}
          currency={settings?.currency||'USD'}
          refresh={load}
        />
      }

      {tab==='transactions'&&
        <Card>
          <Toolbar q={q} setQ={setQ}/>

          <Table headers={['ID','Type','Amount','Status','Date']}>
            {transactions
              .filter(t=>
                (t.transactionId+t.type)
                  .toLowerCase()
                  .includes(q.toLowerCase())
              )
              .map(t=>(
                <tr key={t._id}>
                  <td>{t.transactionId}</td>
                  <td>{t.type}</td>
                  <td>{formatMoney(t.amount,settings?.currency||'USD')}</td>
                  <td>
                    <StatusBadge status={t.status}/>
                  </td>
                  <td>
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
          </Table>
        </Card>
      }

      {tab==='payments'&&
        <CrudPayments
          items={methods}
          currency={settings?.currency||'USD'}
          onAdd={()=>setModal({kind:'payment'})}
          onEdit={m=>setModal({kind:'payment',item:m})}
        />
      }

      {tab==='promos'&&
        <CrudPromos
          items={promos}
          currency={settings?.currency||'USD'}
          onAdd={()=>setModal({kind:'promo'})}
          onEdit={p=>setModal({kind:'promo',item:p})}
        />
      }

      {tab==='rewards'&&
        <CrudRewards
          items={rewards}
          currency={settings?.currency||'USD'}
          onAdd={()=>setModal({kind:'reward'})}
          onEdit={r=>setModal({kind:'reward',item:r})}
        />
      }

      {tab==='support'&& <AdminSupport/>}
{tab==='settings'&&settings&&
        <SettingsPanel
          settings={settings}
          refresh={load}
        />
      }

      {modal&&
        <Modal
          open
          title={`${modal.item?'Edit':'Create'} ${modal.kind}`}
          onClose={()=>setModal(null)}
        >
          <FormModal
            kind={modal.kind}
            editing={modal.item}
            onClose={()=>setModal(null)}
            onSaved={load}
          />
        </Modal>
      }
    </div>
  );
}

function Overview({
  d,
  setTab,
  currency
}:{
  d:AdminDashboardData;
  setTab:(x:string)=>void;
  currency:string
}){
  const stats=[
    ['Total Users',d.users,<Users/>],
    ['Active Users',d.activeUsers,<Users/>],
    ['Deposits',formatMoney(d.deposits,currency),<Wallet/>],
    ['Pending Deposits',d.pendingDeposits,<ShieldCheck/>],
    ['Withdrawals',formatMoney(d.withdrawals,currency),<ArrowDownToLine/>],
    ['Active Packages',d.activePackages,<Boxes/>],
    ['Income Distributed',formatMoney(d.incomeDistributed,currency),<ReceiptText/>],
    ['Rewards Distributed',formatMoney(d.rewardsDistributed,currency),<Gift/>]
  ];

  return (
    <>
      <div className="stats admin-stats">
        {stats.map(([l,v,i])=>(
          <StatCard
            key={String(l)}
            label={String(l)}
            value={v as string|number}
            icon={i}
          />
        ))}
      </div>

      <div className="grid2">

        <Card>
          <div className="card-head">
            <div>
              <h3>Operations</h3>
              <span>
                Open the relevant management workspace.
              </span>
            </div>
          </div>

          <div className="quick-grid">
            <button onClick={()=>setTab('deposits')}>
              <ShieldCheck/>
              Deposit review
            </button>

            <button onClick={()=>setTab('withdrawals')}>
              <ArrowDownToLine/>
              Withdrawal queue
            </button>

            <button onClick={()=>setTab('packages')}>
              <Boxes/>
              Package catalog
            </button>

            <button onClick={()=>setTab('settings')}>
              <Settings/>
              Platform settings
            </button>
          </div>
        </Card>

        <Card>
          <h3>System activity</h3>

          <div className="admin-list">
            <div>
              <span>Package purchases</span>
              <b>{d.packagePurchases}</b>
            </div>

            <div>
              <span>Completed deposits</span>
              <b>{d.completedDeposits}</b>
            </div>

            <div>
              <span>Pending withdrawals</span>
              <b>{d.pendingWithdrawals}</b>
            </div>

            <div>
              <span>Commission distributed</span>
              <b>{formatMoney(d.commissionDistributed,currency)}</b>
            </div>
          </div>
        </Card>

      </div>
    </>
  );
}

function Toolbar({
  q,
  setQ
}:{
  q?:string;
  setQ?:(v:string)=>void
}){
  return (
    <div className="toolbar">
      {setQ&&
        <SearchBar
          value={q||''}
          onChange={setQ}
        />
      }

      <Button
        variant="ghost"
        onClick={()=>window.location.reload()}
      >
        <RefreshCw size={14}/>
        Refresh
      </Button>
    </div>
  );
}

function CrudPackages({
  items,
  currency,
  onAdd,
  onEdit,
  onArchive
}:{
  items:PackagePlan[];
  currency:string;
  onAdd:()=>void;
  onEdit:(p:PackagePlan)=>void;
  onArchive:(p:PackagePlan)=>Promise<void>
}){
  return (
    <Card>
      <div className="toolbar">
        <Button onClick={onAdd}>
          <Plus size={15}/>
          Add Package
        </Button>
      </div>

      <Table headers={['Package','Amount','Daily','Duration','Status','Actions']}>
        {items.map(p=>(
          <tr key={p._id}>
            <td>
              <b>{p.name}</b>
              <small>{p.description}</small>
            </td>

            <td>{formatMoney(p.amount,currency)}</td>

            <td>
              {formatMoney(p.incomeConfiguration.daily,currency)}
            </td>

            <td>{p.cycleDays} days</td>

            <td>
              <StatusBadge status={p.status}/>
            </td>

            <td>
              <div className="action-pair">
                <Button
                  variant="ghost"
                  onClick={()=>onEdit(p)}
                >
                  Edit
                </Button>

                {p.status!=='ARCHIVED'&&
                  <Button
                    variant="danger"
                    onClick={()=>void onArchive(p)}
                  >
                    Archive
                  </Button>
                }
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function ReviewDeposits({
  items,
  currency,
  refresh
}:{
  items:Deposit[];
  currency:string;
  refresh:()=>Promise<void>
}){
  const [busy,setBusy]=useState('');
  const [q,setQ]=useState('');
  const [status,setStatus]=useState('');

  const act=async(id:string,approve:boolean)=>{
    setBusy(id);

    try{
      if(approve){
        await adminService.approveDeposit(id);
      }else{
        await adminService.rejectDeposit(id);
      }

      await refresh();

    }catch(e){
      alert((e as Error).message);
    }finally{
      setBusy('');
    }
  };

  const rows=items.filter(d=>
    (!status||d.status===status)&&
    (
      d.transactionId+
      (d.reference||'')+
      (d.packageName||'')+
      d.method
    )
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  return (
    <Card>
      <div className="toolbar">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search deposit or reference…"
        />

        <select
          value={status}
          onChange={e=>setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option>PENDING</option>
          <option>COMPLETED</option>
          <option>REJECTED</option>
        </select>
      </div>

      <Table headers={['Deposit','Package','Amount','Method','Proof','Status','Date','Actions']}>
        {rows.map(d=>(
          <tr key={d._id}>
            <td>
              <b>{d.transactionId}</b>
              <small>{d.reference||'No reference'}</small>
            </td>

            <td>{d.packageName||'—'}</td>

            <td>{formatMoney(d.amount,currency)}</td>

            <td>{d.method}</td>

            <td>
              {d.proofUrl ? (
                <a
                  href={d.proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display:'inline-flex',
                    alignItems:'center',
                    gap:6
                  }}
                >
                  View Screenshot
                </a>
              ) : (
                <small>No proof</small>
              )}
            </td>

            <td>
              <StatusBadge status={d.status}/>
            </td>

            <td>
              {new Date(d.createdAt).toLocaleString()}
            </td>

            <td>
              {d.status==='PENDING'?
                <div className="action-pair">
                  <Button
                    loading={busy===d._id}
                    onClick={()=>void act(d._id,true)}
                  >
                    <Check size={14}/>
                    Approve
                  </Button>

                  <Button
                    loading={busy===d._id}
                    variant="danger"
                    onClick={()=>void act(d._id,false)}
                  >
                    <X size={14}/>
                    Reject
                  </Button>
                </div>
                :
                <StatusBadge status={d.status}/>
              }
            </td>
          </tr>
        ))}
      </Table>

      {!rows.length&&
        <PageState
          type="empty"
          message="No deposits match the current filters."
        />
      }
    </Card>
  );
}

function ReviewWithdrawals({
  items,
  currency,
  refresh
}:{
  items:Withdrawal[];
  currency:string;
  refresh:()=>Promise<void>
}){
  const [busy,setBusy]=useState('');
  const [q,setQ]=useState('');
  const [status,setStatus]=useState('');

  const act=async(
    id:string,
    action:'approve'|'process'|'reject'|'complete'
  )=>{
    setBusy(id);

    try{
      if(action==='approve')
        await adminService.approveWithdrawal(id);

      if(action==='process')
        await adminService.processWithdrawal(id);

      if(action==='reject')
        await adminService.rejectWithdrawal(id);

      if(action==='complete')
        await adminService.completeWithdrawal(id);

      await refresh();

    }catch(e){
      alert((e as Error).message);
    }finally{
      setBusy('');
    }
  };

  const rows=items.filter(w=>
    (!status||w.status===status)&&
    (
      w.transactionId+
      w.account+
      w.method
    )
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  return (
    <Card>
      <div className="toolbar">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search withdrawal…"
        />

        <select
          value={status}
          onChange={e=>setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option>PENDING</option>
          <option>APPROVED</option>
          <option>PROCESSING</option>
          <option>COMPLETED</option>
          <option>REJECTED</option>
        </select>
      </div>

      <Table headers={['Withdrawal','Amount','Fee','Net','Method','Status','Actions']}>
        {rows.map(w=>(
          <tr key={w._id}>
            <td>
              {w.transactionId}
              <small>{w.account}</small>
            </td>

            <td>{formatMoney(w.amount,currency)}</td>
            <td>{formatMoney(w.fee,currency)}</td>
            <td>{formatMoney(w.netAmount,currency)}</td>
            <td>{w.method}</td>

            <td>
              <StatusBadge status={w.status}/>
            </td>

            <td>
              <div className="action-pair">

                {w.status==='PENDING'&&<>
                  <Button
                    loading={busy===w._id}
                    onClick={()=>void act(w._id,'approve')}
                  >
                    Approve
                  </Button>

                  <Button
                    loading={busy===w._id}
                    variant="danger"
                    onClick={()=>void act(w._id,'reject')}
                  >
                    <X size={14}/>
                    Reject
                  </Button>
                </>}

                {w.status==='APPROVED'&&
                  <Button
                    loading={busy===w._id}
                    onClick={()=>void act(w._id,'process')}
                  >
                    Processing
                  </Button>
                }

                {w.status==='PROCESSING'&&
                  <Button
                    loading={busy===w._id}
                    onClick={()=>void act(w._id,'complete')}
                  >
                    Complete
                  </Button>
                }

              </div>
            </td>
          </tr>
        ))}
      </Table>

      {!rows.length&&
        <PageState
          type="empty"
          message="No withdrawals match the current filters."
        />
      }
    </Card>
  );
}

function CrudPayments({
  items,
  currency,
  onAdd,
  onEdit
}:{
  items:PaymentMethod[];
  currency:string;
  onAdd:()=>void;
  onEdit:(p:PaymentMethod)=>void
}){
  return (
    <Card>
      <Toolbar/>

      <Button onClick={onAdd}>
        <Plus size={15}/>
        Add Payment method
      </Button>

      <Table headers={['Method','Code','Min','Mode','Status','Actions']}>
        {items.map(p=>(
          <tr key={p._id}>
            <td>
              <b>{p.name}</b>

              <small>
                {p.accountDetails||'No receiving account configured'}
              </small>

              <small>
                {p.instructions}
              </small>
            </td>

            <td>{p.code}</td>
            <td>{formatMoney(p.minAmount,currency)}</td>
            <td>{p.verificationMode}</td>

            <td>
              <StatusBadge status={p.status}/>
            </td>

            <td>
              <Button
                variant="ghost"
                onClick={()=>onEdit(p)}
              >
                Edit
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function CrudPromos({
  items,
  currency,
  onAdd,
  onEdit
}:{
  items:PromoCode[];
  currency:string;
  onAdd:()=>void;
  onEdit:(p:PromoCode)=>void
}){
  return (
    <Card>
      <Toolbar/>

      <Button onClick={onAdd}>
        <Plus size={15}/>
        Add Promo
      </Button>

      <Table headers={['Code','Reward','Limits','Status','Actions']}>
        {items.map(p=>(
          <tr key={p._id}>
            <td>{p.code}</td>

            <td>
              {p.rewardType} {formatMoney(p.rewardValue,currency)}
            </td>

            <td>
              {p.usageLimit??'∞'} /
              user {p.perUserLimit??'∞'}
            </td>

            <td>
              <StatusBadge status={p.status}/>
            </td>

            <td>
              <Button
                variant="ghost"
                onClick={()=>onEdit(p)}
              >
                Edit
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function CrudRewards({
  items,
  currency,
  onAdd,
  onEdit
}:{
  items:RewardTier[];
  currency:string;
  onAdd:()=>void;
  onEdit:(r:RewardTier)=>void
}){
  return (
    <Card>
      <Toolbar/>

      <Button onClick={onAdd}>
        <Plus size={15}/>
        Add Reward
      </Button>

      <Table headers={['Threshold','Reward','Order','Status','Actions']}>
        {items.map(r=>(
          <tr key={r._id}>
            <td>{formatMoney(r.threshold,currency)}</td>
            <td>{formatMoney(r.reward,currency)}</td>
            <td>{r.sortOrder}</td>

            <td>
              <StatusBadge status={r.status}/>
            </td>

            <td>
              <Button
                variant="ghost"
                onClick={()=>onEdit(r)}
              >
                Edit
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function SettingsPanel({
  settings:s,
  refresh
}:{
  settings:PlatformSettings;
  refresh:()=>Promise<void>
}){
  const [editing,setEditing]=useState(false);

  const [form,setForm]=useState({
    minimumDeposit:String(s.minimumDeposit),
    minimumWithdrawal:String(s.minimumWithdrawal),
    withdrawalFeePercent:String(s.withdrawalFeePercent),
    cycleIntervalHours:String(s.cycleIntervalHours||24),
    packageDurationDays:String(s.packageDurationDays||365),
    commissionRates:s.commissionRates.join(',')
  });

  const save=async()=>{
    try{
      await adminService.updateSettings({
        minimumDeposit:Number(form.minimumDeposit),
        minimumWithdrawal:Number(form.minimumWithdrawal),
        withdrawalFeePercent:Number(form.withdrawalFeePercent),
        cycleIntervalHours:Number(form.cycleIntervalHours),
        packageDurationDays:Number(form.packageDurationDays),
        commissionRates:form.commissionRates
          .split(',')
          .map(Number)
      });

      setEditing(false);
      await refresh();

    }catch(e){
      alert((e as Error).message);
    }
  };

  return (
    <div className="grid2">

      <Card>
        <h3>Financial settings</h3>

        {editing?
          <div className="form-grid">

            <Field label="Minimum deposit">
              <input
                type="number"
                value={form.minimumDeposit}
                onChange={e=>
                  setForm({
                    ...form,
                    minimumDeposit:e.target.value
                  })
                }
              />
            </Field>

            <Field label="Minimum withdrawal">
              <input
                type="number"
                value={form.minimumWithdrawal}
                onChange={e=>
                  setForm({
                    ...form,
                    minimumWithdrawal:e.target.value
                  })
                }
              />
            </Field>

            <Field label="Withdrawal fee %">
              <input
                type="number"
                value={form.withdrawalFeePercent}
                onChange={e=>
                  setForm({
                    ...form,
                    withdrawalFeePercent:e.target.value
                  })
                }
              />
            </Field>

            <Field label="Cycle interval hours">
              <input
                type="number"
                value={form.cycleIntervalHours}
                onChange={e=>
                  setForm({
                    ...form,
                    cycleIntervalHours:e.target.value
                  })
                }
              />
            </Field>

            <Field label="Package duration days">
              <input
                type="number"
                value={form.packageDurationDays}
                onChange={e=>
                  setForm({
                    ...form,
                    packageDurationDays:e.target.value
                  })
                }
              />
            </Field>

            <Field label="Commission rates (4 levels)">
              <input
                value={form.commissionRates}
                onChange={e=>
                  setForm({
                    ...form,
                    commissionRates:e.target.value
                  })
                }
              />
            </Field>

            <Button onClick={()=>void save()}>
              Save settings
            </Button>

          </div>
          :
          <>
            <div className="settings-list">

              <div>
                <span>Minimum deposit</span>
                <b>{formatMoney(s.minimumDeposit,s.currency)}</b>
              </div>

              <div>
                <span>Minimum withdrawal</span>
                <b>{formatMoney(s.minimumWithdrawal,s.currency)}</b>
              </div>

              <div>
                <span>Withdrawal fee</span>
                <b>{s.withdrawalFeePercent}%</b>
              </div>

              <div>
                <span>Cycle interval</span>
                <b>{s.cycleIntervalHours||24}h</b>
              </div>

              <div>
                <span>Package duration</span>
                <b>{s.packageDurationDays||365} days</b>
              </div>

            </div>

            <Button onClick={()=>setEditing(true)}>
              <SlidersHorizontal size={15}/>
              Edit settings
            </Button>
          </>
        }
      </Card>

      <Card>
        <h3>Commission levels</h3>

        <div className="mini-settings">
          {s.commissionRates.map((r,i)=>(
            <div key={i}>
              <span>Level {i+1}</span>
              <strong>{r}%</strong>
            </div>
          ))}
        </div>

        <p className="muted-copy">
          Reward tiers and payment methods are managed in
          their dedicated configuration workspaces.
        </p>
      </Card>

    </div>
  );
}




