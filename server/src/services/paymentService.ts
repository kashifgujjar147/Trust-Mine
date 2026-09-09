export interface PaymentVerificationInput{method:string;amount:number;reference:string;destination?:string}export interface PaymentVerificationResult{verified:boolean;providerReference?:string;reason?:string}
export async function verifyPayment(input:PaymentVerificationInput):Promise<PaymentVerificationResult>{// Provider adapters intentionally remain non-fraudulent: manual mode always requires admin verification.
if(process.env.PAYMENT_MODE==='manual')return {verified:false,reason:'MANUAL_REVIEW_REQUIRED'};return {verified:false,reason:'PROVIDER_NOT_CONFIGURED'};}
