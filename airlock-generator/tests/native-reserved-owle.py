"""Native serialization regression: emitted wiring is checked against the FBD graph.
No native compile or simulator claim; no remote or equipment access.
"""
import copy,hashlib,json,pathlib,runpy,subprocess,tempfile,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'experimental/native-reserved-owle.py'))
capture=ROOT/'experimental/native-gui/Issue28_PR100_PRIMITIVES_GUI_CAPTURE.owle'
plan=json.loads(subprocess.check_output(['node','-e',"const f=require('./native-airlock-fbd');console.log(JSON.stringify(f.build(f.twoDoor())))"],cwd=ROOT))
count=0
def test(name,fn):
 global count
 fn();count+=1;print('PASS NATIVE_RESERVED',name)
def rejected(fn,contains):
 try:fn()
 except (ValueError,KeyError) as e:assert contains in str(e),(contains,str(e))
 else:raise AssertionError('MUTATION_ACCEPTED_'+contains)
def read(path):
 with zipfile.ZipFile(path) as z:
  assert z.namelist()==['Project'],'NO_ST'
  r=json.loads(z.read('Project'));return next(iter(r.values()))['DocumentModel']
def logical(w):
 e=m['element'](w)
 if e['Comment'] is None and w['Discriminator'] in (2,3):
  return 'DEVICE_'+e['Title']  # GUI regenerates physical IO wrappers without comments.
 return e['Comment'].split(' | ')[0]
def semantic_check(doc):
 m['validate_document'](doc)
 native={logical(w):w for w in doc['Elements']}
 ids={p['UniqueId']:(logical(w),p['Name']) for w in doc['Elements'] for p in m['element'](w)['Ports']}
 actual={(ids[c['ConnectorModel']['FromPortUId']],ids[c['ConnectorModel']['ToPortUId']]) for c in doc['ConnectorModels']}
 drivers={e['to']:e['from'] for e in plan['edges']}
 imap={'CLOSED_A':'I1','CLOSED_B':'I2','REQUEST_A':'I3','REQUEST_B':'I4','FIRE_NORMAL':'I5','RESET':'I6','DATA_HEALTHY':'I7'}
 omap={'PERMIT_A':'Q1','PERMIT_B':'Q2','BUZZER':'Q3','FAULT_LATCH':'Q4'}
 ref={id:('DEVICE_'+title,'Output0') for id,title in imap.items()}
 expected=[]
 for n in plan['nodes']:
  kind,id=n['kind'],n['id']
  if kind in ('INPUT','OUTPUT'):continue
  args=[drivers[id+'.'+p] for p in n['inputs']]
  if kind in ('AND','OR'):
   prev=args[0]
   for i in range(1,len(args)):
    sub=id if i==len(args)-1 else id+'_PART_'+str(i)
    assert m['element'](native[sub])['Title']==kind
    expected.extend([(prev,(sub,'Input0')),(args[i],(sub,'Input1'))]);ref[sub]=(sub,'Output2');prev=sub
  else:
   w=native[id];title=m['element'](w)['Title'];assert title==('RTRIG' if kind=='R_TRIG' else kind)
   if kind=='RS':expected.extend([(drivers[id+'.R'],(id,'Input0')),(drivers[id+'.S'],(id,'Input1'))])
   else:expected.append((args[0],(id,'Input0')))
   ref[id]=(id,'Output1' if kind=='NOT' else 'Output0')
   if kind=='TON':assert w['ImpulseTime']*1000==n['presetMs'] and w['TimeScale']==0
 for id,title in omap.items():expected.append((drivers[id+'.IN'],('DEVICE_'+title,'Input0')))
 assert actual=={(ref[src],dst) for src,dst in expected},'NATIVE_LOGIC_MISMATCH'

with tempfile.TemporaryDirectory(prefix='airlock-reserved-') as tmp:
 tmp=pathlib.Path(tmp);out=tmp/'two.owle'
 source_sha=hashlib.sha256(capture.read_bytes()).hexdigest()
 report=m['generate'](plan,capture,out);doc=read(out)
 test('all native primitive types, RS R/S pins and 194 wires match FBD plan',lambda:semantic_check(doc))
 def io_layout():
  points=[tuple(m['element'](w)['Location'][k] for k in ('X','Y')) for w in doc['Elements'] if w['Discriminator'] in (2,3)]
  assert len(set(points))==len(points),'OVERLAPPING_DEVICE_IO'
 test('all physical device IO labels have distinct positions',io_layout)
 def vendor_roundtrip():
  saved=ROOT/'experimental/issue28/Airlock_2DOOR_GUI_ROUNDTRIP_UNVERIFIED.owle'
  assert hashlib.sha256(saved.read_bytes()).hexdigest()=='fb281472d40eae84da2dee8a1896cd29de5ee6f4e7ae5e2a1da62d2a1fc7c999'
  semantic_check(read(saved))
 test('actual vendor Save As preserves all native wiring and timers',vendor_roundtrip)
 def determinism():
  other=tmp/'again.owle';m['generate'](plan,capture,other);assert out.read_bytes()==other.read_bytes()
  committed=ROOT/'experimental/issue28/Airlock_2DOOR_FBD_TEST_ONLY_UNVERIFIED.owle'
  assert out.read_bytes()==committed.read_bytes(),'COMMITTED_OWLE_DRIFT'
 test('deterministic bytes, source untouched, status remains unverified',determinism)
 assert source_sha==hashlib.sha256(capture.read_bytes()).hexdigest()
 assert report['status']=='NATIVE_GUI_NOT_VERIFIED' and report['compileVerified'] is False
 test('overwrite original or existing output refused',lambda:rejected(lambda:m['generate'](plan,capture,out),'REFUSE_OVERWRITE'))
 def seven():
  bad=copy.deepcopy(plan);bad['doors'][0]['id']='OTHER';target=tmp/'seven.owle'
  rejected(lambda:m['generate'](bad,capture,target),'CANNOT_FIT_PR100_CAPTURE');assert not target.exists()
 test('unconfirmed device IO expansion refused before file creation',seven)
 def missing():
  bad=copy.deepcopy(plan);bad['edges'].pop();target=tmp/'missing.owle'
  rejected(lambda:m['generate'](bad,capture,target),'UNWIRED_PLAN_INPUT');assert not target.exists()
 test('missing plan wire rejected',missing)
 def duplicate():
  bad=copy.deepcopy(doc);e=m['element'](bad['Elements'][0]);e['Ports'][0]['UniqueId']=e['UniqueId']
  rejected(lambda:m['validate_document'](bad),'DUPLICATE_OR_INVALID_UUID')
 test('duplicate native port UUID rejected',duplicate)
 def reversed_rs():
  bad=copy.deepcopy(doc);rs=next(w for w in bad['Elements'] if logical(w)=='RESERVED_A');p=m['element'](rs)['Ports']
  p0,p1=p[0]['UniqueId'],p[1]['UniqueId']
  for c in bad['ConnectorModels']:
   wire=c['ConnectorModel']
   if wire['ToPortUId']==p0:wire['ToPortUId']=p1
   elif wire['ToPortUId']==p1:wire['ToPortUId']=p0
  rejected(lambda:semantic_check(bad),'WIRE_GEOMETRY_ENDPOINT_MISMATCH')
 test('swapped RS set/reset cannot pass structural QA',reversed_rs)
 def wrong_timer():
  bad=copy.deepcopy(doc);next(w for w in bad['Elements'] if logical(w)=='HOLD_AB')['ImpulseTime']=9
  try:semantic_check(bad)
  except AssertionError:pass
  else:raise AssertionError('WRONG_TIMER_ACCEPTED')
 test('wrong 10s timer rejected',wrong_timer)
 def st():
  bad=copy.deepcopy(plan);bad['nodes'].append({'id':'SCRIPT','kind':'ST','inputs':[]})
  target=tmp/'st.owle';rejected(lambda:m['generate'](bad,capture,target),'UNSUPPORTED_PRIMITIVE_ST');assert not target.exists()
 test('ST or substitute script primitive refused',st)
print(f'NATIVE_RESERVED_SERIALIZATION {count}/{count} PASS; NATIVE_GUI_NOT_VERIFIED')
