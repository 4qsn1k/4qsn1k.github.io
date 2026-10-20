"""Structural proof for an AUTHENTIC vendor-GUI-saved FBD 2-door test.
Read only, offline; NEVER flash PLC or alter .owle.
Usage: python -B tests/native-gui-two-door-proof.py <actual-file.owle>
No substitute local mock file is considered evidence of native GUI compiling.
"""
import sys, json, zipfile, hashlib, pathlib, collections
def verify(filename):
 p=pathlib.Path(filename)
 if not p.exists() or not p.is_file():
  raise ValueError("GUI_SAVED_NATIVE_FILE_REQUIRED")
 if p.suffix.lower()!=".owle" or p.stat().st_size>4_000_000:
  raise ValueError("GUI_SAVED_OWLE_TOO_LARGE_OR_WRONG_EXTENSION")
 raw=p.read_bytes()
 with zipfile.ZipFile(p,"r") as archive:
  assert "Project" in archive.namelist(),"MISSING_VENDOR_PROJECT"
  root=json.loads(archive.read("Project"))
 docs=[]
 def walk(v):
  if isinstance(v,dict):
   if isinstance(v.get("DocumentModel"),dict):docs.append(v["DocumentModel"])
   for sub in v.values():walk(sub)
  elif isinstance(v,list):
   for sub in v:walk(sub)
 walk(root)
 assert len(docs)==1,f"EXPECTED_ONE_FBD_DOCUMENT_{len(docs)}"
 doc=docs[0]
 port_name={}
 elems={}
 for w in doc["Elements"]:
  element=w.get("ElementModel") or (w.get("ElementBlockModel") or {}).get("ElementModel")
  if not isinstance(element,dict):
   continue
  title=element.get("Title")
  assert title and title not in elems,f"DUPLICATE_OR_MISSING_VENDOR_ELEMENT_{title}"
  elems[title]=(w,element)
  for port in element.get("Ports",[]):
   uid=port["UniqueId"]
   assert uid not in port_name,f"DUPLICATE_VENDOR_PORT_UUID_{uid}"
   port_name[uid]=(title,port["Name"])
 assert len(port_name)>=19,"MISSING_FIXED_NATIVE_IO_PORTS"
 assert set(["I1","I2","AND","TON","Q1"]).issubset(elems),  "EXPECTED_TWO_REEDS_AND_10S_TIMER_CHAIN"
 assert [elems[k][0]["Discriminator"] for k in ("I1","I2","AND","TON","Q1")]==[2,2,18,12,3],  "NOT_VENDOR_PRIMITIVES"
 assert "ST" not in repr([(w.get("ElementModel") or {}).get("Title") for w in doc["Elements"]]),"ST_BLOCK_FOUND"
 timer=elems["TON"][0]
 assert timer.get("ImpulseTime")==10 and timer.get("TimeScale")==0,  "TON_NOT_EXACTLY_GUI_TESTED_TEN_SECONDS"
 edges=[]
 incoming=collections.Counter()
 for item in doc["ConnectorModels"]:
  m=item["ConnectorModel"]
  start,end=m["FromPortUId"],m["ToPortUId"]
  assert start in port_name and end in port_name,"DANGLING_NATIVE_WIRE"
  source,target=port_name[start],port_name[end]
  edges.append((source,target))
  incoming[target]+=1
  assert incoming[target]==1,f"DOUBLE_DRIVER_{target}"
 expected=[
  (("I1","Output0"),("AND","Input0")),
  (("I2","Output0"),("AND","Input1")),
  (("AND","Output2"),("TON","Input0")),
  (("TON","Output0"),("Q1","Input0"))
 ]
 assert sorted(edges)==sorted(expected),f"INCORRECT_TWO_DOOR_WIRING_{edges}"
 return {
  "nativeGuiSaved":True,"vendorFileSha256":hashlib.sha256(raw).hexdigest(),
  "schema":"airlock-native-gui-2door-structural-proof/1",
  "numberOfVendorBlocks":len(doc["Elements"]),
  "physicalReedInputs":2,"tonSeconds":10,"vendorWireCount":len(edges),
  "output":"Q1=TON(AND(I1,I2),10s)",
  "editorSimulationObservedSeparately":True,
  "physicalPlcNotAccessed":True,
  "scudLockCommandNotYetImplemented":True,
  "readyForFieldDownload":False
 }
if __name__=="__main__":
 try:
  if len(sys.argv)!=2:raise ValueError("USAGE: native-gui-two-door-proof.py <GUI-saved.owle>")
  print("NATIVE_GUI_TWO_DOOR_PROOF_PASS",json.dumps(verify(sys.argv[1]),ensure_ascii=False,sort_keys=True))
 except Exception as exc:
  print("NATIVE_GUI_TWO_DOOR_PROOF_FAIL",str(exc),file=sys.stderr)
  sys.exit(1)
