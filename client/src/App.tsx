import {BrowserRouter,Routes,Route,Navigate,useParams} from 'react-router-dom';
import {Suspense} from 'react';
import {AuthProvider} from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Protected,{AdminOnly} from './routes/Protected';
import LoginPage,{Register,ForgotPassword,ResetPassword} from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Packages from './pages/Packages';
import Deposit from './pages/Deposit';
import Admin from './pages/Admin';
import {
  PackageDetails,
  DepositHistory,
  Withdrawal,
  WithdrawalHistory,
  Transactions,
  Team,
  Rewards,
  Promo,
  Profile,
  Settings,
  Notifications,
  Activity,
  Support
} from './pages/Modules';
import './styles.css';

function PackageDetailsRoute(){
  const {id}=useParams();
  return <PackageDetails id={id||''}/>;
}

export default function App(){
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage/>}/>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
