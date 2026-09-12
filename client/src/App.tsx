import {BrowserRouter,Routes,Route,Navigate,useParams,useLocation} from 'react-router-dom';
import {lazy,Suspense} from 'react';
import {AuthProvider,useAuth} from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Protected,{AdminOnly} from './routes/Protected';
import './styles.css';

const LiveChatWidget=lazy(()=>import('./components/LiveChatWidget'));

const Login=lazy(()=>import('./pages/Auth').then(m=>({default:m.Login})));
const Register=lazy(()=>import('./pages/Auth').then(m=>({default:m.Register})));
const ForgotPassword=lazy(()=>import('./pages/Auth').then(m=>({default:m.ForgotPassword})));
const ResetPassword=lazy(()=>import('./pages/Auth').then(m=>({default:m.ResetPassword})));

const Dashboard=lazy(()=>import('./pages/Dashboard'));
const Packages=lazy(()=>import('./pages/Packages'));
const Deposit=lazy(()=>import('./pages/Deposit'));
const Admin=lazy(()=>import('./pages/Admin'));

const PackageDetails=lazy(()=>import('./pages/Modules').then(m=>({default:m.PackageDetails})));
const DepositHistory=lazy(()=>import('./pages/Modules').then(m=>({default:m.DepositHistory})));
const Withdrawal=lazy(()=>import('./pages/Modules').then(m=>({default:m.Withdrawal})));
const WithdrawalHistory=lazy(()=>import('./pages/Modules').then(m=>({default:m.WithdrawalHistory})));
const Transactions=lazy(()=>import('./pages/Modules').then(m=>({default:m.Transactions})));
const Team=lazy(()=>import('./pages/Modules').then(m=>({default:m.Team})));
const Rewards=lazy(()=>import('./pages/Modules').then(m=>({default:m.Rewards})));
const Promo=lazy(()=>import('./pages/Modules').then(m=>({default:m.Promo})));
const Profile=lazy(()=>import('./pages/Modules').then(m=>({default:m.Profile})));
const Settings=lazy(()=>import('./pages/Modules').then(m=>({default:m.Settings})));
const Notifications=lazy(()=>import('./pages/Modules').then(m=>({default:m.Notifications})));
const Activity=lazy(()=>import('./pages/Modules').then(m=>({default:m.Activity})));
const Support=lazy(()=>import('./pages/Modules').then(m=>({default:m.Support})));

function PageLoading(){
  return (
    <div
      className="page"
      style={{
        display:'grid',
        placeItems:'center',
        minHeight:'50vh'
      }}
    >
      <div style={{fontWeight:700}}>
        Loading...
      </div>
    </div>
  );
}

function LiveChatHost(){
  const {user}=useAuth();
  const location=useLocation();

  if(!user) return null;
  if(location.pathname.startsWith('/admin')) return null;

  return (
    <Suspense fallback={null}>
      <LiveChatWidget/>
    </Suspense>
  );
}

function PackageDetailsRoute(){
  const {id}=useParams();
  return <PackageDetails id={id||''}/>;
}

export default function App(){
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoading/>}>
          <Routes>

            <Route path="/login" element={<Login/>}/>
            <Route path="/register" element={<Register/>}/>
            <Route path="/forgot-password" element={<ForgotPassword/>}/>
            <Route path="/reset-password" element={<ResetPassword/>}/>

            <Route element={<Protected/>}>
              <Route element={<AppLayout/>}>

                <Route path="/dashboard" element={<Dashboard/>}/>
                <Route path="/packages" element={<Packages/>}/>
                <Route path="/packages/:id" element={<PackageDetailsRoute/>}/>
                <Route path="/deposit" element={<Deposit/>}/>
                <Route path="/deposit-history" element={<DepositHistory/>}/>
                <Route path="/withdrawal" element={<Withdrawal/>}/>
                <Route path="/withdrawal-history" element={<WithdrawalHistory/>}/>
                <Route path="/team" element={<Team/>}/>
                <Route path="/rewards" element={<Rewards/>}/>
                <Route path="/promo" element={<Promo/>}/>
                <Route path="/transactions" element={<Transactions/>}/>
                <Route path="/profile" element={<Profile/>}/>
                <Route path="/settings" element={<Settings/>}/>
                <Route path="/notifications" element={<Notifications/>}/>
                <Route path="/activity" element={<Activity/>}/>
                <Route path="/support" element={<Support/>}/>

                <Route element={<AdminOnly/>}>
                  <Route path="/admin" element={<Admin/>}/>
                </Route>

              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace/>}/>
            <Route path="*" element={<Navigate to="/dashboard" replace/>}/>

          </Routes>
        </Suspense>

        <LiveChatHost/>
      </BrowserRouter>
    </AuthProvider>
  );
}


