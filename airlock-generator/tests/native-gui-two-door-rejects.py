"""Negative tests: tamper a COPY of actual vendor GUI .owle; no device IO."""
import pathlib, tempfile,zipfile,json,sys,runpy
root=pathlib.Path(__file__).resolve().parent.parent
verify=runpy.run_path(str(pathlib.Path(__file__).with_name("native-gui-two-door-proof.py")))["verify"]
source=root/"experimental"/"native-gui"/"Airlock_NATIVE_2DOOR_INTERLOCK_10S_GUI_20261020.owle"
assert source.exists(),"VENDOR_NATIVE_SOURCE_MISSING"
verify(source)
with zipfile.ZipFile(source) as z:
 members={n:z.read(n) for n in z.namelist()}
project=json.loads(members["Project"])
d=next(v["DocumentModel"] for v in project.values() if "DocumentModel" in v)
scenarios={}
scenarios["missing_wire"]=lambda d:d["ConnectorModels"].pop()
scenarios["wrong_ton"]=lambda d:next(w for w in d["Elements"] if w["Discriminator"]==12).__setitem__("ImpulseTime",9)
scenarios["multiple_drivers"]=lambda d:d["ConnectorModels"].append(json.loads(json.dumps(d["ConnectorModels"][0])))
scenarios["wrong_wire_target"]=lambda d:d["ConnectorModels"].__setitem__(0,json.loads(json.dumps(d["ConnectorModels"][1])))
def write_zip(out,doc):
 clone=json.loads(json.dumps(project))
 target=next(v["DocumentModel"] for v in clone.values() if "DocumentModel" in v)
 target.clear()
 target.update(doc)
 payload=json.dumps(clone,ensure_ascii=False).encode("utf-8")
 with zipfile.ZipFile(out,"w") as z:
  for n,data in members.items():
   z.writestr(n,payload if n=="Project" else data)
with tempfile.TemporaryDirectory(prefix="airlock-native-fbd-qa-") as temp:
 for name,action in scenarios.items():
  testdoc=json.loads(json.dumps(d))
  action(testdoc)
  target=pathlib.Path(temp)/(name+".owle")
  write_zip(target,testdoc)
  try:verify(target)
  except (AssertionError,ValueError) as err:print("PASS NATIVE_GUI_REJECT",name,str(err)[:100])
  else:raise AssertionError("INVALID_VENDOR_PROJECT_ACCEPTED_"+name)
print("NATIVE_GUI_2DOOR_MUTATIONS 4/4 PASS")
