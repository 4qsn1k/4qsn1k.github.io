#!/usr/bin/env python3
import runpy
m=runpy.run_path("/home/octopi3d/Home3DOctoPrintBot/bot_ui.py")
class TG:
 def __init__(self): self.calls=[]
 def request(self,method,payload,**kwargs):
  self.calls.append((method,payload))
  return True
class OP:
 def __init__(self): self.actions=[]
 def get(self,path):
  if path=="/api/job": return {"job":{"file":{"name":"sample.gcode"}},"progress":{"completion":46.8,"printTime":545,"printTimeLeft":600}}
  if path=="/api/printer":return {"temperature":{"tool0":{"actual":201.5,"target":210},"bed":{"actual":71.2,"target":75}}}
  if path=="/api/connection":return {"current":{"state":"Printing"}}
  if path=="/api/files/local":return {"files":[{"name":"sample.gcode","type":"machinecode"}]}
 def post_json(self,path,body):self.actions.append((path,body))
 def snapshot(self):return bytes((255,216,255))+b"abc"
tg,op=TG(),OP()
b=m["PrettyBot"](tg,op,123456789)
msg=lambda text,who=123456789: {"chat":{"type":"private","id":who},"from":{"id":who},"text":text}
b.process(msg("/start"))
assert tg.calls[-1][0]=="sendMessage"
assert len(tg.calls[-1][1]["reply_markup"]["inline_keyboard"][0])==2
b.process(msg("/status"))
assert "46.8%" in tg.calls[-1][1]["text"]
b.process(msg("/files"))
assert b.file_choices["0"]=="sample.gcode"
b.process(msg("/cancel"))
assert b.pending[0]=="cancel"
b.process(msg("/start",123456))
assert len(tg.calls)==4
assert not op.actions
b.handle_callback({"callback_query":{"id":"abc","message":{"chat":{"type":"private","id":123456789},"message_id":23},"from":{"id":123456789},"data":"menu:home"}})
assert tg.calls[-1][0]=="editMessageText"
b.handle_callback({"callback_query":{"id":"def","message":{"chat":{"type":"private","id":999111999},"message_id":23},"from":{"id":999111999},"data":"act:pause"}})
assert not op.actions
print("UI_TESTS_OK")
print("HOME_2X2_OK")
print("ACCESS_FILTER_OK")
print("NO_PRINTER_ACTIONS=YES")