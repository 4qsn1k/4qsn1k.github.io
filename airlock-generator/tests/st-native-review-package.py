#!/usr/bin/env python3
"""Check captured wiring and source-only packaging. NOT native compilation."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
import zipfile

ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'experimental/issue28/st-acceptance'
spec=importlib.util.spec_from_file_location('packager',ROOT/'scripts/prepare-st-two-door-project.py')
pkg=importlib.util.module_from_spec(spec);spec.loader.exec_module(pkg)
CANDIDATE=BASE/'Airlock_2DOOR_ST_REVIEW_UNVERIFIED_20261021.owle'
SOURCE=(BASE/'FB_Airlock2.st').read_text()


def read(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        return {n:z.read(n) for n in z.namelist()}


def validate(data):
    docs=read(data)
    project=json.loads(docs['Project'])
    definitions=json.loads(docs['StFunctionBlocks'])
    fb=next(d for d in definitions if d['Name']=='FB_Airlock2')
    assert fb['SourceCode'].replace('\r\n','\n')==SOURCE,'SOURCE_DRIFT'
    doc=next(iter(project.values()))['DocumentModel']
    elements=doc['Elements'];ports={};ids=set();instances=[]
    for wrapper in elements:
        e=wrapper.get('ElementModel') or wrapper['ElementBlockStoreModel']['ElementModel']
        assert e['UniqueId'] not in ids,'DUPLICATE_ELEMENT'
        ids.add(e['UniqueId'])
        if wrapper['Discriminator']==41: instances.append(wrapper)
        for p in e['Ports']:
            assert p['UniqueId'] not in ports,'DUPLICATE_PORT'
            assert p['AnchorUniqueId'] in [a.get('UniqueId') for a in e['Primitives']],'ANCHOR'
            ports[p['UniqueId']]=(e['Title'],p['Name'])
    assert len(instances)==1
    instance=instances[0]
    assert instance['FunctionBlockUId']==fb['Id']
    assert instance['LastModificationId']==fb['LastModificationId']
    director=instance['FunctionalBlocksDirectorStoreModel']
    for key in ('InputNames','OutputNames'):
        assert director[key]==fb[key],key
    assert fb['InputNames']==['CLOSED_A','CLOSED_B','REQUEST_A','REQUEST_B','FIRE_NORMAL','RESET','DATA_HEALTHY']
    assert fb['OutputNames'][:4]==['PERMIT_A','PERMIT_B','BUZZER','FAULT']
    assert len(fb['FbInstances'])==4
    assert all(x['TemplateName']=='SYS.TON' for x in fb['FbInstances'])
    wires=[];wireids=set()
    for wrapper in doc['ConnectorModels']:
        w=wrapper['ConnectorModel']
        assert w['UniqueId'] not in wireids,'DUPLICATE_WIRE_ID'
        wireids.add(w['UniqueId'])
        wires.append((ports[w['FromPortUId']],ports[w['ToPortUId']]))
    expected={(('I'+str(i+1),'Output0'),('FB_Airlock2','Input'+str(i))) for i in range(7)}
    expected|={(('FB_Airlock2','Output'+str(i)),('Q'+str(i+1),'Input0')) for i in range(4)}
    assert len(wires)==11 and set(wires)==expected,'EXACT_11_WIRES'


class NativePackageTests(unittest.TestCase):
    def test_preserves_all_original_captures_and_oracle(self):
        hashes=json.loads((BASE/'immutable-inputs.json').read_text())['files']
        hashes={**hashes,
                str(pkg.TEMPLATE.relative_to(ROOT)):pkg.TEMPLATE_SHA,
                'experimental/issue28/st-acceptance/Airlock_ST00_TimerProbe_VENDOR_20261021.owle':'59e5bea9403c1a6e26724ece4e3791e6505aabb6cd7132c6bb8e9f8b73162336',
                'experimental/issue28/st-acceptance/FB_ST_TimerProbe_VENDOR_20261021.fbst':'2b6bea340311b3dae88ee86b3891e8abe9ca719da7e38490bbd965bfcc4ef72c'}
        for p,digest in hashes.items():
            self.assertEqual(hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),digest,p)

    def test_candidate_reproduces_and_has_all_eleven_correct_connections(self):
        data=CANDIDATE.read_bytes()
        # ZIP compression bytes can vary between Python/zlib versions; compare
        # complete decompressed members, not the compression implementation.
        self.assertEqual(read(data),read(pkg.build(SOURCE)))
        validate(data)

    def test_only_selected_source_changed_no_vendor_metadata_or_geometry_inference(self):
        old=read(pkg.TEMPLATE.read_bytes());new=read(CANDIDATE.read_bytes())
        self.assertEqual(set(old),set(new))
        self.assertEqual(old['Project'],new['Project'])
        od=json.loads(old['StFunctionBlocks']);nd=json.loads(new['StFunctionBlocks'])
        for a,b in zip(od,nd):
            if a['Name']=='FB_Airlock2':
                self.assertNotEqual(a['SourceCode'],b['SourceCode'])
                b['SourceCode']=a['SourceCode']
            self.assertEqual(a,b)
        self.assertEqual(len(od),len(nd))

    def test_declaration_change_refused(self):
        with self.assertRaisesRegex(ValueError,'DECLARATION_CHANGE'):
            pkg.build(SOURCE.replace('  State : UDINT := 0;','  State : UDINT := 0;\n  NewVariable : BOOL;'))

    def test_broken_wiring_and_source_are_rejected(self):
        for mode in ('missing','source','duplicate'):
            contents=read(CANDIDATE.read_bytes())
            if mode=='source':
                defs=json.loads(contents['StFunctionBlocks']);defs[1]['SourceCode']='INVALID'
                contents['StFunctionBlocks']=json.dumps(defs).encode()
            else:
                docs=json.loads(contents['Project']);doc=next(iter(docs.values()))['DocumentModel']
                if mode=='missing': doc['ConnectorModels'].pop()
                else: doc['ConnectorModels'].append(doc['ConnectorModels'][0])
                contents['Project']=json.dumps(docs).encode()
            out=io.BytesIO()
            with zipfile.ZipFile(out,'w') as z:
                for k,v in contents.items(): z.writestr(k,v)
            with self.subTest(mode=mode),self.assertRaises(AssertionError):validate(out.getvalue())


if __name__=='__main__':
    print('SOURCE_ONLY_NATIVE_CONTAINER_STRUCTURE; ST_NATIVE_NOT_VERIFIED',flush=True)
    unittest.main(testRunner=unittest.TextTestRunner(stream=sys.stdout,verbosity=2))
