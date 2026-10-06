import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try{
    const token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,'').trim();
    const {subject,message}=await req.json();
    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!serviceKey)return json({error:'Edge Function sunucu yapılandırması eksik.'},500);
    if(!token)return json({error:'Oturum gerekli.'},401);
    const callerClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:caller,error:callerError}=await callerClient.auth.getUser(token);if(callerError||!caller.user)return json({error:'Oturum doğrulanamadı.'},401);
    const admin=callerClient;
    const {data:profile}=await admin.from('profiles').select('full_name,email,phone').eq('id',caller.user.id).maybeSingle();
    const {data:admins,error:adminsError}=await admin.from('user_branch_roles').select('user_id').ilike('role','SUPER_ADMIN');if(adminsError)return json({error:adminsError.message},500);
    let recipients=(admins??[]).map(a=>a.user_id);
    if(!recipients.length)return json({error:'SUPER_ADMIN hesabı bulunamadı.'},404);
    const cleanSubject=String(subject??'').trim(); const cleanMessage=String(message??'').trim();
    if(!cleanSubject||!cleanMessage)return json({error:'Konu ve mesaj zorunludur.'},400);
    const payload='[KASA_HELP_V1]'+JSON.stringify({sender_id:caller.user.id,sender_name:profile?.full_name??caller.user.user_metadata?.full_name??'',sender_email:profile?.email??caller.user.email??'',sender_phone:profile?.phone??'',subject:cleanSubject.slice(0,160),message:cleanMessage.slice(0,5000)});
    const rows=[...new Set(recipients)].map(user_id=>({user_id,title:'Yeni yardım talebi',message:payload,is_read:false}));
    const {error}=await admin.from('notifications').insert(rows);if(error)return json({error:error.message},500);
    return json({sent_to:rows.length});
  }catch(error){return json({error:error instanceof Error?error.message:'Beklenmeyen sunucu hatası.'},500)}
});
