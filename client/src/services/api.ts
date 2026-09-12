import axios,{AxiosRequestConfig} from 'axios';

const apiBaseUrl = String(import.meta.env.VITE_API_URL ?? '').trim();

if (import.meta.env.PROD && !apiBaseUrl) {
  throw new Error('VITE_API_URL is required in production.');
}

export const api = axios.create({
  baseURL: apiBaseUrl || 'http://localhost:5000/api',
  timeout: 8000
});

api.interceptors.request.use(c=>{
  const t=localStorage.getItem('tm_token');
  if(t)c.headers.Authorization=`Bearer ${t}`;
  return c;
});

api.interceptors.response.use(
  r=>r,
  e=>{
    const message=e?.response?.data?.message;
    if(message)e.message=message;
    return Promise.reject(e);
  }
);

type CacheEntry={expiresAt:number;data:unknown};
const GET_CACHE_MS=10000;
const getCache=new Map<string,CacheEntry>();
const inFlight=new Map<string,Promise<unknown>>();

function isCacheable(config:AxiosRequestConfig){
  return (config.method??'get').toLowerCase()==='get' && config.headers?.['x-no-cache']!=='1';
}

function cacheKey(config:AxiosRequestConfig){
  const params=config.params?JSON.stringify(config.params):'';
  const token=localStorage.getItem('tm_token')||'';
  return `${config.baseURL||''}|${config.url||''}|${params}|${token}`;
}

function invalidateCache(){
  getCache.clear();
}

export const setToken=(t:string)=>{
  localStorage.setItem('tm_token',t);
  invalidateCache();
};
export const clearToken=()=>{
  localStorage.removeItem('tm_token');
  invalidateCache();
};
export const mockMode=String(import.meta.env.VITE_MOCK_MODE??'false')==='true';

export async function request<T>(config:AxiosRequestConfig):Promise<T>{
  const cacheable=isCacheable(config);
  if(!cacheable){
    const r=await api.request<T>(config);
    invalidateCache();
    return r.data;
  }

  const key=cacheKey(config);
  const cached=getCache.get(key);
  if(cached && cached.expiresAt>Date.now())return cached.data as T;
  if(cached)getCache.delete(key);

  const running=inFlight.get(key);
  if(running)return running as Promise<T>;

  const work=api.request<T>(config).then(r=>{
    getCache.set(key,{expiresAt:Date.now()+GET_CACHE_MS,data:r.data});
    return r.data;
  }).finally(()=>{
    inFlight.delete(key);
  });

  inFlight.set(key,work);
  return work;
}

/* Keep axios calls used directly by services fast too: dedupe/cache GET requests. */
const rawRequest=api.request.bind(api);
api.request=((config:any)=>{
  if(!isCacheable(config))return rawRequest(config);

  const key=cacheKey(config);
  const cached=getCache.get(key);
  if(cached && cached.expiresAt>Date.now()){
    return Promise.resolve({data:cached.data,status:200,statusText:'OK',headers:{},config});
  }
  const running=inFlight.get(key);
  if(running){
    return running.then(data=>({data,status:200,statusText:'OK',headers:{},config}));
  }

  const work=rawRequest(config).then((r:any)=>{
    getCache.set(key,{expiresAt:Date.now()+GET_CACHE_MS,data:r.data});
    return r;
  }).finally(()=>inFlight.delete(key));

  inFlight.set(key,work as Promise<unknown>);
  return work;
}) as typeof api.request;
