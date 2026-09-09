import axios,{AxiosRequestConfig} from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'http://localhost:5000/api',timeout:8000});
api.interceptors.request.use(c=>{const t=localStorage.getItem('tm_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c;});
api.interceptors.response.use(r=>r,e=>{const message=e?.response?.data?.message;if(message)e.message=message;return Promise.reject(e);});
export const setToken=(t:string)=>localStorage.setItem('tm_token',t);
export const clearToken=()=>localStorage.removeItem('tm_token');
export const mockMode=String(import.meta.env.VITE_MOCK_MODE??'false')==='true';
export async function request<T>(config:AxiosRequestConfig):Promise<T>{const r=await api.request<T>(config);return r.data;}
