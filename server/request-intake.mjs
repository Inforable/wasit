import {HttpError} from './errors.mjs';

const BANK={
  ac_service:{quantity:'How many AC units need service?',concern:['Routine cleaning','Not cooling','Leaking or dripping','Unusual noise','Not sure'],detail:'When was it last serviced?',label:'Previous service',choices:['Under 6 months ago','About a year ago','Over 2 years ago','Not sure']},
  washer:{quantity:'How many washing machines need service?',concern:['Routine service','Not spinning','Leaking','Unusual noise','Not sure'],detail:'What type of washing machine is it?',label:'Washing machine type',choices:['Top-loading','Front-loading','Not sure']},
  plumbing:{quantity:'How many separate plumbing jobs should providers quote?',concern:['Leaking or dripping','Blocked drain','Weak water flow','Not sure'],detail:'Where is the affected area?',label:'Affected area',choices:['Bathroom','Kitchen','Outside','Not sure']},
  electrical:{quantity:'How many separate electrical jobs should providers quote?',concern:['Breaker trips','An outlet is not working','Flickering lights','Not sure'],detail:'Where is the affected area?',label:'Affected area',choices:['Kitchen','Bathroom','Bedroom','Outside','Not sure']},
  cleaning:{quantity:'How many home-cleaning visits should providers quote?',concern:['Routine cleaning','Dust buildup','Stubborn stains','Odour','Not sure'],detail:'How many rooms need attention during the visit?',label:'Rooms to clean',choices:['1 room','2 rooms','3 rooms','4 or more rooms','Not sure']},
};
const invalid=message=>new HttpError(400,'invalid_payload',message);
export function intakeQuestions(category,details={}) {
  const bank=BANK[category];if(!bank)return [];
  return [
    {id:'units',kind:'choice',required:true,label:bank.quantity,hint:'Confirm the exact quantity so every provider quotes the same work.',options:['1','2','3','4','Other'],...(details.units!=null?{default_value:String(details.units)}:{})},
    {id:'service_context',kind:'multi',required:false,label:'What should providers know about the request?',hint:'Your own description, not a diagnosis. Select any that apply or skip.',options:bank.concern,allow_other:false},
    {id:'detail_context',kind:'choice',required:false,label:bank.detail,hint:'Optional. Not sure and Skip are both fine.',options:bank.choices,allow_other:false},
  ];
}
export function applyIntakeAnswers(original,answers) {
  const input={...original,answers:{...original.answers,...answers}};
  if(original._intake_phase!=='scope')return input;
  const bank=BANK[original._intake_details?.category];
  if(!bank)throw invalid('Choose a supported service before confirming details.');
  const quantity=Number(answers.units);
  if(!Number.isInteger(quantity)||quantity<1||quantity>20)throw invalid('Confirm an exact quantity from 1 to 20.');
  input.answers.units=String(quantity);
  const context=[];
  for(const [key,label,options]of [['service_context','Customer concern',bank.concern],['detail_context',bank.label,bank.choices]]){
    const raw=answers[key];
    if(raw==null||raw===''||raw==='__skip__')continue;
    const values=Array.isArray(raw)?raw:[raw];
    if(values.length>5||(key==='detail_context'&&values.length>1)||values.some(value=>typeof value!=='string'||!options.includes(value)))throw invalid('Choose one of the offered service details or skip it.');
    const unique=[...new Set(values)];
    if(unique.includes('Not sure')&&unique.length>1)throw invalid('Choose Not sure by itself or select the details you know.');
    if(unique.length)context.push({id:key,label,answers:unique});
  }
  input._review_done=true;input._review_category=original._intake_details.category;input._customer_context=context;
  return input;
}
export function publicCustomerContext(job) {
  const bank=BANK[job?.category];if(!bank)return '';
  const allowed={service_context:{label:'Customer concern',values:bank.concern},detail_context:{label:bank.label,values:bank.choices}};
  return (job.customer_context??[]).flatMap(record=>{
    const definition=allowed[record?.id];
    if(!definition||!Array.isArray(record.answers))return [];
    const values=record.answers.filter(value=>definition.values.includes(value)&&value!=='Not sure');
    return values.length?[definition.label+': '+values.join(', ')]:[];
  }).join('. ');
}
export function prepareIntake(input,result) {
  const details=result.details??(result.job?{category:result.job.category,units:null,location_label:result.job.location_label,schedule_label:result.job.schedule_label,max_budget:result.job.max_budget,target_price:result.job.target_price}:null);
  const reviewed=input._review_done&&input._review_category===details?.category;
  if(input.confirm_details===true&&!reviewed&&details?.category){
    return {...result,status:'needs_clarification',job:null,questions:intakeQuestions(details.category,details),details,intake_stage:'scope'};
  }
  const job=result.job?{...result.job,...(reviewed?{customer_context:input._customer_context??[]}:{} )}:null;
  return {...result,...(job?{job}:{}),details,intake_stage:result.status==='needs_clarification'?'details':null};
}
