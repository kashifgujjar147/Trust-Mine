import {RequestHandler} from 'express';
import {ZodSchema} from 'zod';

export const validate=(schema:ZodSchema):RequestHandler=>(req,res,next)=>{
  const r=schema.safeParse(req.body);
  if(!r.success){
    res.status(400).json({message:'Validation failed',errors:r.error.flatten()});
    return;
  }
  req.body=r.data;
  next();
};
