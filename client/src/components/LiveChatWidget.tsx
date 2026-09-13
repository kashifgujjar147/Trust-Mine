
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {supportService} from '../services';
import type {SupportMessage,SupportTicket} from '../types';

export default function LiveChatWidget(){

  const [open,setOpen]=useState(false);
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [ticket,setTicket]=useState<SupportTicket|null>(null);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [message,setMessage]=useState('');
  const [subject,setSubject]=useState('');
  const [loading,setLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [newConversation,setNewConversation]=useState(false);

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
                : String(nested ?? '')
        };
      })
      .filter((item:any)=>item._id);
  };

  const activeTicket=ticket;

  const unread=useMemo(
    ()=>tickets.reduce(
      (sum,t)=>sum+(Number(t.unreadForUser)||0),
      0
    ),
    [tickets]
  );

  /*
   * Always reload the complete ticket list from server.
   * Do not replace it with a local copy after admin replies.
   */
  const loadTickets=async()=>{
    try{

      const data=await supportService.getTickets();
      const normalized=normalizeTickets(data);

      setTickets(normalized);

      if(ticket?._id){

        const fresh=
          normalized.find(
            (x:SupportTicket)=>
              String(x._id)===String(ticket._id)
          );

        if(fresh){
          setTicket(fresh);
        }
      }

      return normalized;

    }catch(e){

      setError(
        (e as Error).message ||
        'Unable to load support conversations.'
      );

      return [];
    }
  };

  const loadMessages=async(
    id:string,
    markRead=true
  )=>{

    try{

      const data=
        await supportService.getMessages(id);

      setMessages(
        normalizeMessages(data)
      );

      if(markRead){

        const readResult=
          await supportService.markRead(id);

        /*
         * Important:
         * update the current ticket using the server response,
         * instead of waiting for polling.
         */
        const updatedTicket=
          readResult?.ticket;

        if(updatedTicket){

          setTicket(
            (current)=>current &&
              String(current._id)===String(id)
              ? updatedTicket
              : current
          );

          setTickets(
            (current)=>
              current.map((t)=>
                String(t._id)===String(id)
                  ? {
                      ...t,
                      ...updatedTicket,
                      unreadForUser:0
                    }
                  : t
              )
          );
        }else{
          await loadTickets();
        }
      }

    }catch(e){

      setError(
        (e as Error).message ||
        'Unable to load messages.'
      );
    }
  };

  /*
   * Load tickets whenever chat opens.
   */
  useEffect(()=>{

    if(!open) return;

    let alive=true;

    const first=async()=>{

      setLoading(true);
      setError('');

      try{

        const data=
          await supportService.getTickets();

        if(!alive) return;

        setTickets(
          normalizeTickets(data)
        );

      }catch(e){

        if(alive){

          setError(
            (e as Error).message ||
            'Unable to load support.'
          );
        }

      }finally{

        if(alive){
          setLoading(false);
        }
      }
    };

    first();

    /*
     * Poll tickets independently.
     *
     * IMPORTANT:
     * We do NOT call loadMessages() here.
     * Calling both simultaneously caused state races where
     * an older ticket object could overwrite the fresh one.
     */
    const timer=
      window.setInterval(async()=>{

        if(!alive) return;

        const normalized=
          await loadTickets();

        if(!alive) return;

        /*
         * Refresh messages only after ticket list is loaded.
         * Do not mark them read while merely polling.
         */
        if(
          ticket?._id &&
          ticket.status!=='RESOLVED'
        ){

          try{

            const data=
              await supportService.getMessages(
                ticket._id
              );

            if(alive){

              setMessages(
                normalizeMessages(data)
              );
            }

          }catch(e){
            // Keep existing messages on temporary polling errors.
          }
        }

      },10000);

    return()=>{

      alive=false;
      window.clearInterval(timer);

    };

  },[open,ticket?._id,ticket?.status]);

  const openTicket=async(t:SupportTicket)=>{

    setTicket(t);
    setNewConversation(false);
    setError('');
    setMessages([]);

    await loadMessages(
      String(t._id),
      true
    );
  };

  const createConversation=async(
    e:FormEvent
  )=>{

    e.preventDefault();

    if(!subject.trim() || !message.trim()){

      setError(
        'Subject and message are required.'
      );

      return;
    }

    setSending(true);
    setError('');

    try{

      const created=
        await supportService.createTicket({
          subject:subject.trim(),
          message:message.trim()
        });

      /*
       * Get the authoritative ticket list from server.
       * This prevents locally-created tickets from disappearing
       * after the next refresh.
       */
      const normalized=
        await loadTickets();

      const serverTicket=
        normalized.find(
          (x:SupportTicket)=>
            String(x._id)===String(created._id)
        ) || created;

      setNewConversation(false);
      setTicket(serverTicket);
      setSubject('');
      setMessage('');

      await loadMessages(
        String(serverTicket._id),
        true
      );

    }catch(e){

      setError(
        (e as Error).message ||
        'Unable to create conversation.'
      );

    }finally{

      setSending(false);
    }
  };

  const send=async(
    e:FormEvent
  )=>{

    e.preventDefault();

    if(
      !activeTicket ||
      !message.trim() ||
      activeTicket.status==='RESOLVED'
    ){
      return;
    }

    setSending(true);
    setError('');

    try{

      await supportService.sendMessage(
        String(activeTicket._id),
        message.trim()
      );

      setMessage('');

      /*
       * Reload both ticket and messages from server.
       * This guarantees the latest state survives refresh.
       */
      await loadTickets();

      await loadMessages(
        String(activeTicket._id),
        false
      );

    }catch(e){

      setError(
        (e as Error).message ||
        'Unable to send message.'
      );

    }finally{

      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="live-chat-fab"
        onClick={()=>setOpen(x=>!x)}
        aria-label="Open support chat"
      >
        <span className="live-chat-fab-icon">
          💬
        </span>

        {unread>0 && (
          <span className="live-chat-badge">
            {unread>99?'99+':unread}
          </span>
        )}
      </button>

      {open && (
        <div className="live-chat-window">

          <div className="live-chat-header">

            <div>
              <strong>Live Support</strong>
              <span>Usually replies shortly</span>
            </div>

            <button
              type="button"
              className="live-chat-close"
              onClick={()=>setOpen(false)}
            >
              ×
            </button>

          </div>

          {error && (
            <div className="live-chat-error">
              {error}
            </div>
          )}

          {!activeTicket ? (

            <div className="live-chat-body">

              {loading ? (

                <div className="live-chat-empty">
                  Loading conversations...
                </div>

              ) : tickets.length>0 && !newConversation ? (

                <>

                  <div className="live-chat-section-title">
                    Your conversations
                  </div>

                  <div className="live-chat-ticket-list">

                    {tickets.map(t=>(

                      <button
                        type="button"
                        className="live-chat-ticket"
                        key={String(t._id)}
                        onClick={()=>openTicket(t)}
                      >

                        <div>

                          <strong>
                            {t.subject}
                          </strong>

                          <span>
                            {t.lastMessagePreview||t.message}
                          </span>

                        </div>

                        <div className="live-chat-ticket-meta">

                          <small>
                            {t.status}
                          </small>

                          {(Number(t.unreadForUser)||0)>0 && (
                            <b>
                              {t.unreadForUser}
                            </b>
                          )}

                        </div>

                      </button>
                    ))}

                  </div>

                  <button
                    type="button"
                    className="btn live-chat-new"
                    onClick={()=>{

                      setTicket(null);
                      setMessages([]);
                      setSubject('');
                      setMessage('');
                      setError('');
                      setNewConversation(true);

                    }}
                  >
                    Start new conversation
                  </button>

                </>

              ) : (

                <form
                  onSubmit={createConversation}
                  className="live-chat-form"
                >

                  <div className="live-chat-section-title">
                    Chat with support
                  </div>

                  <input
                    className="field-input"
                    placeholder="Subject"
                    value={subject}
                    onChange={e=>
                      setSubject(e.target.value)
                    }
                    maxLength={150}
                  />

                  <textarea
                    className="field-input live-chat-textarea"
                    placeholder="How can we help?"
                    value={message}
                    onChange={e=>
                      setMessage(e.target.value)
                    }
                    maxLength={5000}
                  />

                  <button
                    className="btn"
                    disabled={sending}
                  >
                    {sending
                      ? 'Sending...'
                      : 'Start chat'}
                  </button>

                </form>
              )}

            </div>

          ) : (

            <>

              <div className="live-chat-conversation-top">

                <button
                  type="button"
                  onClick={()=>{

                    setTicket(null);
                    setNewConversation(false);
                    setMessages([]);

                  }}
                  className="live-chat-back"
                >
                  ←
                </button>

                <div>

                  <strong>
                    {activeTicket.subject}
                  </strong>

                  <span>
                    {activeTicket.status}
                  </span>

                </div>

              </div>

              <div className="live-chat-messages">

                {messages.length===0 ? (

                  <div className="live-chat-empty">
                    No messages yet.
                  </div>

                ) : (

                  messages.map((m,index)=>(

                    <div
                      key={`${m._id}-${index}`}
                      className={
                        `live-chat-message ${
                          m.senderRole==='USER'
                            ? 'mine'
                            : 'support'
                        }`
                      }
                    >

                      <div>
                        {m.message}
                      </div>

                      <small>
                        {new Date(
                          m.createdAt
                        ).toLocaleTimeString([],{
                          hour:'2-digit',
                          minute:'2-digit'
                        })}
                      </small>

                    </div>
                  ))
                )}

              </div>

              {activeTicket.status==='RESOLVED' ? (

                <div className="live-chat-resolved">
                  This conversation has been resolved.
                </div>

              ) : (

                <form
                  onSubmit={send}
                  className="live-chat-compose"
                >

                  <textarea
                    className="field-input live-chat-textarea"
                    placeholder="Write a message..."
                    value={message}
                    onChange={e=>
                      setMessage(e.target.value)
                    }
                    maxLength={5000}
                  />

                  <button
                    className="btn"
                    disabled={
                      sending ||
                      !message.trim()
                    }
                  >
                    {sending
                      ? 'Sending...'
                      : 'Send'}
                  </button>

                </form>
              )}

            </>
          )}

        </div>
      )}
    </>
  );
}