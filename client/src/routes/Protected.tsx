import {Navigate,Outlet} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';

export default function Protected(){
  const {user,loading}=useAuth();
  if(user)return <Outlet/>;
  if(loading)return <div className="center">Loading TRUST MINE…</div>;
  return <Navigate to="/login" replace/>;
}

export function AdminOnly(){
  const {user,loading}=useAuth();
  if(user?.role==='ADMIN')return <Outlet/>;
  if(loading)return <div className="center">Loading…</div>;
  return <Navigate to="/dashboard" replace/>;
}
