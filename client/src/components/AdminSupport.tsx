import {useEffect,useState} from 'react';
import {adminService} from '../services';
import type {SupportMessage,SupportTicket} from '../types';

export default function AdminSupport(){

  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [selected,setSelected]=useState<SupportTicket|null>(null);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');

  const normalizeTickets=(value:any):SupportTicket[]=>{
    if(Array.isArray(value)) return value;

    if(Array.isArray(value?.tickets)){
      return value.tickets;
    }

    if(Array.isArray(value?.data)){
      return value.data;
    }

    if(Array.isArray(value?.data?.tickets)){
      return value.data.tickets;
    }

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
      const data=await adminService.getSupportTickets();
      const normalized=normalizeTickets(data);

      setTickets(normalized);

      setSelected(current=>{
        if(!current) return current;

        const fresh=normalized.find(
          (x:SupportTicket)=>x._id===current._id
        );

        return fresh||current;
      });
    }catch(e){
      setError((e as Error).message||'Unable to load support tickets.');
    }finally{
      setLoading(false);
    }
  };

  const loadMessages=async(id:string,markRead=true)=>{
    try{
      const data=await adminService.getSupportMessages(id);
      const normalized=normalizeMessages(data);

      setMessages(normalized);

      if(markRead){
        await adminService.markSupportRead(id);
      }
    }catch(e){
      setError((e as Error).message||'Unable to load messages.');
    }
  };

  useEffect(()=>{
    loadTickets();

    const timer=window.setInterval(async()=>{
      await loadTickets();
    },10000);

    return ()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    if(!selected) return;

    loadMessages(selected._id);

    const timer=window.setInterval(()=>{
      loadMessages(selected._id,false);
    },10000);

    return ()=>window.clearInterval(timer);
  },[selected?._id]);

  const selectTicket=async(t:SupportTicket)=>{
    setSelected(t);
    setError('');
    await loadMessages(t._id,true);
    await loadTickets();
  };

  const send=async()=>{
    if(!selected || !message.trim() || selected.status==='RESOLVED'){
      return;
    }

    setSending(true);
    setError('');

    try{
      const sent=await adminService.sendSupportMessage(
        selected._id,
        message.trim()
      );

      setMessages(x=>[...x,...normalizeMessages([sent])]);
      setMessage('');

      await loadMessages(selected._id,false);
      await loadTickets();
    }catch(e){
      setError((e as Error).message||'Unable to send reply.');
    }finally{
      setSending(false);
    }
  };

  const changeStatus=async(
    status:'OPEN'|'IN_PROGRESS'|'RESOLVED'
  )=>{
    if(!selected) return;

    try{
      const updated=await adminService.updateSupportStatus(
        selected._id,
        status
      );

      setSelected(x=>x?{
        ...x,
        status:updated.status||status
      }:x);

      await loadTickets();
    }catch(e){
      setError((e as Error).message||'Unable to update status.');
    }
  };

  return (
    <div className="admin-support">

      <div className="admin-support-list">

        <div className="admin-support-title">
          <div>
            <h3>Live Support</h3>
            <p>Customer conversations and support requests</p>
          </div>

          <button
            type="button"
            className="btn"
            onClick={loadTickets}
          >
            Refresh
          </button>
        </div>

        {error && <div className="live-chat-error">{error}</div>}

        {loading ? (
          <div className="card admin-support-empty">
            Loading support...
          </div>
        ) : tickets.length===0 ? (
          <div className="card admin-support-empty">
            No support conversations yet.
          </div>
        ) : (
          <div className="admin-support-tickets">
            {tickets.map((t,index)=>(
              <button
                type="button"
                key={`${t._id}-${index}`}
                className={`admin-support-ticket ${
                  selected?._id===t._id?'active':''
                }`}
                onClick={()=>selectTicket(t)}
              >
                <div className="admin-support-ticket-main">
                  <strong>{t.subject}</strong>

                  <span>
                    {t.user?.fullName||
                      t.user?.email||
                      'Customer'}
                  </span>

                  <p>
                    {t.lastMessagePreview||t.message}
                  </p>
                </div>

                <div className="admin-support-ticket-meta">
                  <small>{t.status}</small>

                  {(t.unreadForAdmin||0)>0 &&
                    <b>{t.unreadForAdmin}</b>
                  }
                </div>
              </button>
            ))}
          </div>
        )}

      </div>

      <div className="admin-support-chat">

        {!selected ? (
          <div className="card admin-support-empty">
            Select a conversation to view messages.
          </div>
        ) : (
          <>

            <div className="admin-support-chat-header">
              <div>
                <strong>{selected.subject}</strong>

                <span>
                  {selected.user?.fullName||
                    selected.user?.email||
                    'Customer'}
                </span>
              </div>

              <select
                value={selected.status}
                onChange={e=>changeStatus(
                  e.target.value as
                    'OPEN'|'IN_PROGRESS'|'RESOLVED'
                )}
              >
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">
                  IN PROGRESS
                </option>
                <option value="RESOLVED">
                  RESOLVED
                </option>
              </select>
            </div>

            <div className="admin-support-messages">

              {messages.length===0 ? (
                <div className="admin-support-empty">
                  No messages yet.
                </div>
              ) : (
                messages.map((m,index)=>(
                  <div
                    key={`${m._id}-${index}`}
                    className={`admin-support-message ${
                      m.senderRole==='ADMIN'
                        ?'mine'
                        :'customer'
                    }`}
                  >
                    <div>
                      <strong>
                        {m.senderRole==='ADMIN'
                          ?'Admin'
                          :'Customer'}
                      </strong>

                      <p>{m.message}</p>
                    </div>

                    <small>
                      {new Date(
                        m.createdAt
                      ).toLocaleString()}
                    </small>
                  </div>
                ))
              )}

            </div>

            {selected.status==='RESOLVED' ? (
              <div className="live-chat-resolved">
                This conversation is resolved.
              </div>
            ) : (
              <div className="admin-support-compose">

                <textarea
                  className="field-input"
                  placeholder="Write reply..."
                  value={message}
                  onChange={e=>setMessage(e.target.value)}
                  maxLength={5000}
                />

                <button
                  type="button"
                  className="btn"
                  disabled={sending||!message.trim()}
                  onClick={send}
                >
                  {sending?'Sending...':'Send reply'}
                </button>

              </div>
            )}

          </>
        )}

      </div>

    </div>
  );
}

