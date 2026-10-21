#!/usr/bin/env python3
"""Source-only update of the captured, fully wired two-door vendor project.

Does NOT compile ST or infer metadata. Declaration changes are refused: GUI
must regenerate variable indexes, ports and timer metadata in that case.
The output is a separate UNVERIFIED candidate requiring GUI recompile/Save As.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'experimental/issue28/st-acceptance'
TEMPLATE = BASE / 'Airlock_2DOOR_ST_VENDOR_UNVERIFIED_20261021.owle'
TEMPLATE_SHA = '22fb493dad414d2e32e36987464293c25d98bb9ea87bddb5dbec3516ee59e77a'


def declarations(source):
    return source.replace('\r\n','\n').rsplit('END_VAR',1)[0]


def build(source):
    raw = TEMPLATE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != TEMPLATE_SHA:
        raise ValueError('VENDOR_TEMPLATE_HASH_MISMATCH')
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as original:
        if original.testzip() is not None or original.namelist() != ['Project','StFunctionBlocks']:
            raise ValueError('UNEXPECTED_TEMPLATE')
        definitions = json.loads(original.read('StFunctionBlocks'))
        block = next(x for x in definitions if x['Name']=='FB_Airlock2')
        if declarations(block['SourceCode']) != declarations(source):
            raise ValueError('DECLARATION_CHANGE_REQUIRES_VENDOR_GUI_EXPORT')
        block['SourceCode'] = source.replace('\r\n','\n').replace('\n','\r\n')
        with zipfile.ZipFile(output,'w') as dest:
            for entry in original.infolist():
                data = original.read(entry.filename)
                if entry.filename=='StFunctionBlocks':
                    data = json.dumps(definitions,ensure_ascii=False,separators=(',',':')).encode('utf-8')
                dest.writestr(entry,data)
    return output.getvalue()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',required=True,type=Path)
    args=parser.parse_args()
    if args.out.suffix.lower()!='.owle': parser.error('output must be .owle')
    data=build((BASE/'FB_Airlock2.st').read_text(encoding='utf-8'))
    with args.out.open('xb') as f: f.write(data)
    print('TWO_DOOR_SOURCE_ONLY_CANDIDATE',hashlib.sha256(data).hexdigest())
    print('ST_NATIVE_NOT_VERIFIED; GUI recompile and Save As required; metadata preserved, not regenerated')
