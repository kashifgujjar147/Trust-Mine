import {useEffect,useState} from 'react';
import {NavLink,useNavigate,Outlet} from 'react-router-dom';
import {LayoutDashboard,UserCircle,WalletCards,ArrowDownToLine,Boxes,Users,Gift,TicketPercent,ReceiptText,LifeBuoy,Settings,Menu,X,LogOut,ShieldCheck,Bell,History,MessageCircle} from 'lucide-react';
import {useAuth} from '../context/AuthContext';

const whatsappChannel=import.meta.env.VITE_WHATSAPP_CHANNEL_URL as string | undefined;

const userItems=[
  ['/dashboard','Dashboard',LayoutDashboard],
  ['/profile','My Profile',UserCircle],
  ['/deposit','Deposit',WalletCards],
  ['/deposit-history','Deposit History',ReceiptText],
  ['/withdrawal','Withdrawal',ArrowDownToLine],
  ['/withdrawal-history','Withdrawal History',ReceiptText],
  ['/packages','Package Plans',Boxes],
  ['/team','My Team',Users],
  ['/rewards','Rewards',Gift],
  ['/promo','Promo Code',TicketPercent],
  ['/transactions','Transactions',ReceiptText],
  ['/notifications','Notifications',Bell],
  ['/activity','Activity History',History],
  ['/support','Support',LifeBuoy],
  ['/settings','Settings',Settings]
] as const;

export default function AppLayout(){
  const [open,setOpen]=useState(false);
  const [showWhatsAppJoin,setShowWhatsAppJoin]=useState(false);
  const {user,logout}=useAuth();
  const nav=useNavigate();

  useEffect(()=>{
    if(user && whatsappChannel){
      setShowWhatsAppJoin(true);
    }else{
      setShowWhatsAppJoin(false);
    }
  },[user]);

  const handleLogout=()=>{
    setShowWhatsAppJoin(false);
    logout();
    nav('/login');
  };

  return (
    <div className="shell">

      <div
        className={open?'overlay show':'overlay'}
        onClick={()=>setOpen(false)}
      />

      <aside className={open?'sidebar open':'sidebar'}>

        <div className="brand">
          <span>TM</span>
          <div>
            <b>TRUST MINE</b>
            <small>Mine Today • Earn Tomorrow</small>
          </div>
          <button
            className="mobile-x"
            onClick={()=>setOpen(false)}
          >
            <X size={20}/>
          </button>
        </div>

        <nav>
          {userItems.map(([to,label,Icon])=>(
            <NavLink
              key={to}
              to={to}
              onClick={()=>setOpen(false)}
              className={({isActive})=>isActive?'active':''}
            >
              <Icon size={18}/>
              {label}
            </NavLink>
          ))}

          {user?.role==='ADMIN'&&(
            <NavLink
              to="/admin"
              onClick={()=>setOpen(false)}
              className={({isActive})=>isActive?'active':''}
            >
              <ShieldCheck size={18}/>
              Admin Panel
            </NavLink>
          )}
        </nav>

        {whatsappChannel&&(
          <a
            className="logout"
            href={whatsappChannel}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18}/>
            WhatsApp Channel
          </a>
        )}

        <button
          className="logout"
          onClick={handleLogout}
        >
          <LogOut size={18}/>
          Logout
        </button>

      </aside>

      <main className="main">

        <header>
          <button
            className="hamb"
            onClick={()=>setOpen(true)}
          >
            <Menu/>
          </button>

          <div className="header-title">
            <span className="eyebrow">TRUSTMINE</span>
            <h2>Mine Today • Earn Tomorrow</h2>
          </div>

          <button
            className="icon-btn"
            onClick={()=>nav('/notifications')}
          >
            <Bell size={18}/>
            <i/>
          </button>

          <div
            className="profile-chip"
            onClick={()=>nav('/profile')}
          >
            <div className="avatar">
              {user?.fullName?.[0]||'U'}
            </div>
            <div>
              <b>{user?.fullName||'Guest'}</b>
              <small>ID: {user?.userId||'—'}</small>
            </div>
          </div>
        </header>

        <Outlet/>

      </main>

      {showWhatsAppJoin&&whatsappChannel&&(
        <div
          style={{
            position:'fixed',
            inset:0,
            zIndex:99999,
            background:'rgba(0,0,0,0.72)',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            padding:'20px'
          }}
        >
          <div
            style={{
              width:'100%',
              maxWidth:'460px',
              background:'#fff',
              borderRadius:'24px',
              padding:'32px 26px',
              textAlign:'center',
              boxShadow:'0 25px 70px rgba(0,0,0,0.35)'
            }}
          >
            <div
              style={{
                width:'72px',
                height:'72px',
                margin:'0 auto 18px',
                borderRadius:'50%',
                background:'#25D366',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                color:'#fff'
              }}
            >
              <MessageCircle size={38}/>
            </div>

            <h2
              style={{
                margin:'0 0 10px',
                fontSize:'25px',
                fontWeight:800,
                color:'#111827'
              }}
            >
              Join Our WhatsApp Channel
            </h2>

            <p
              style={{
                margin:'0 auto 24px',
                maxWidth:'370px',
                color:'#6b7280',
                lineHeight:1.6,
                fontSize:'15px'
              }}
            >
              Stay updated with the latest TRUST MINE announcements,
              important updates, offers and platform news.
              Join our official WhatsApp Channel before continuing.
            </p>

            <a
              href={whatsappChannel}
              target="_blank"
              rel="noreferrer"
              style={{
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                gap:'9px',
                width:'100%',
                boxSizing:'border-box',
                padding:'14px 18px',
                borderRadius:'12px',
                background:'#25D366',
                color:'#fff',
                textDecoration:'none',
                fontWeight:700,
                fontSize:'15px',
                marginBottom:'12px'
              }}
            >
              <MessageCircle size={19}/>
              Join WhatsApp Channel
            </a>

            <button
              type="button"
              onClick={()=>setShowWhatsAppJoin(false)}
              style={{
                width:'100%',
                padding:'13px 18px',
                borderRadius:'12px',
                border:'1px solid #d1d5db',
                background:'#f9fafb',
                color:'#374151',
                fontWeight:700,
                fontSize:'14px',
                cursor:'pointer'
              }}
            >
              I've Joined — Continue
            </button>

            <p
              style={{
                margin:'16px 0 0',
                fontSize:'12px',
                color:'#9ca3af'
              }}
            >
              Please join the channel to receive important updates.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
