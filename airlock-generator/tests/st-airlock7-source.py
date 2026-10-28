#!/usr/bin/env python3
"""Actual generated scalar ST execution; HOST ONLY, NOT vendor compilation."""
import copy
import importlib.util
import itertools
import json
from pathlib import Path
import random
import sys
import unittest

from st_source_runtime import QUALIFICATION, Runtime

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('st_generator', ROOT/'scripts/generate-st-reserved.py')
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
CANDIDATE = json.loads(gen.FIXTURE.read_text())
SOURCE = (gen.BASE/'FB_Airlock7.st').read_text()
IDS, GROUPS = gen.topology(CANDIDATE)
ORACLE = json.loads((ROOT/'experimental/issue28/ST_REFERENCE_VECTORS_OFFLINE.json').read_text())
INITIAL = {'FIRE_NORMAL': True, 'DATA_HEALTHY': True, 'RESET': False}
for d in IDS:
    INITIAL['CLOSED_'+d] = True
    INITIAL['REQUEST_'+d] = False


def field(prefix, d): return (prefix+'_'+d).upper()

def conflicts(a, b):
    return a != b and any(a in g['doorIds'] and b in g['doorIds'] for g in GROUPS)


class Rig:
    def __init__(self):
        self.runtime = Runtime(SOURCE)
        self.now = 0
        self.value = None

    def scan(self, changes=None, dt=0):
        self.now += dt
        self.value = self.runtime.scan(changes, self.now)
        # Check every scan, not merely the last sample in a trace.
        granted = [d for d in IDS if self.value[field('PERMIT', d)]]
        for a, b in itertools.combinations(granted, 2):
            assert not conflicts(a,b), (a,b)
        for d in IDS:
            assert self.value[field('GREEN',d)] == self.value[field('PERMIT',d)]
            if d in granted:
                assert self.value[field('RESERVED',d)]
                assert self.runtime.values['REQUEST_'+d]
                assert self.runtime.values['FIRE_NORMAL'] and self.runtime.values['DATA_HEALTHY']
                for g in GROUPS:
                    if d in g['doorIds']:
                        assert self.value['READY_'+g['roomId']]
                        assert all(self.runtime.values['CLOSED_'+x] for x in g['doorIds'])
                        assert all(not self.value[field('RESERVED', x)] for x in g['doorIds'] if x != d)
        if self.value['FAULT'] or self.value['EMERGENCY']: assert not granted
        return self.value

    def ready(self, changes=None):
        self.scan({**INITIAL, **(changes or {})})
        return self.scan(dt=10000)

    def grants(self): return [d for d in IDS if self.value[field('PERMIT',d)]]


class SevenDoorSourceTests(unittest.TestCase):
    def test_reproducible_source_and_manifest(self):
        for name, content in gen.outputs().items():
            self.assertEqual((gen.BASE/name).read_text(), content, name)
        self.assertEqual(len(IDS), 7)
        self.assertEqual(len(GROUPS), 6)
        self.assertEqual(len(Runtime(SOURCE).timers), 20)
        self.assertNotIn('R1274', SOURCE)

    def test_simulator_stimulus_drives_all_128_masks_then_low_without_stale_bits(self):
        stimulus = Runtime((gen.BASE/'FB_RequestMask7_SIMULATOR_ONLY.st').read_text())
        for mask in range(128):
            v=stimulus.scan({'MASK':mask,'SAMPLE':True})
            self.assertEqual([d for d in IDS if v['REQUEST_'+d]],
                             [d for i,d in enumerate(IDS) if mask & (1<<i)])
            v=stimulus.scan({'SAMPLE':False})
            self.assertFalse(any(v.values()))
        self.assertFalse(any(stimulus.scan({'MASK':128,'SAMPLE':True}).values()))

    def test_generator_rejects_untrusted_topology(self):
        for mode in ('duplicate', 'case', 'member', 'timer', 'self', 'identifier', 'orphan'):
            c = copy.deepcopy(CANDIDATE)
            if mode == 'duplicate': c['physicalDoors'].append(c['physicalDoors'][0])
            if mode == 'case': c['physicalDoors'][1]['id'] = IDS[0].lower()
            if mode == 'member': c['interlockZones'][0]['doorIds'] = [IDS[0]]
            if mode == 'timer': c['interlockZones'][0]['timedBlockHoldSec'] = 0
            if mode == 'self': c['physicalDoors'][0]['a'] = c['physicalDoors'][0]['b']
            if mode == 'identifier': c['physicalDoors'][0]['id'] = 'BAD;CODE'
            if mode == 'orphan': c['physicalDoors'].append({'id':'EXTRA','a':'OUTSIDE','b':'OTHER'})
            with self.subTest(mode=mode), self.assertRaises(ValueError): gen.generate(c)

    def test_general_generator_handles_renamed_two_door_topology(self):
        c = {'physicalDoors': [{'id':'LEFT','a':'OUT','b':'ROOM'}, {'id':'RIGHT','a':'ROOM','b':'OUT2'}],
             'interlockZones':[{'roomId':'ROOM','doorIds':['LEFT','RIGHT'],'timedBlockHoldSec':10}]}
        r = Runtime(gen.generate(c, 'FB_Example'))
        r.scan({'CLOSED_LEFT':True,'CLOSED_RIGHT':True,'FIRE_NORMAL':True,'DATA_HEALTHY':True})
        r.scan({},10000)
        v = r.scan({'REQUEST_LEFT':True,'REQUEST_RIGHT':True},10000)
        self.assertTrue(v['PERMIT_LEFT']); self.assertFalse(v['PERMIT_RIGHT'])

    def test_all_128_masks_match_frozen_oracle_and_independent_greedy(self):
        # Exact sets, liveness and conflicts: an always-FALSE implementation fails.
        for vector in ORACLE['all128SevenDoorRequests']:
            rig = Rig(); rig.ready()
            mask = vector['mask']
            rig.scan({'REQUEST_'+d: bool(mask & (1<<i)) for i,d in enumerate(IDS)})
            expected = []
            for d in vector['requested']:
                if all(not conflicts(d, old) for old in expected): expected.append(d)
            with self.subTest(mask=mask):
                self.assertEqual(rig.grants(), expected)
                self.assertEqual(rig.grants(), vector['granted'])
                self.assertFalse(rig.value['FAULT'])

    def test_all_128_masks_against_each_existing_closed_and_open_owner(self):
        checked = 0
        for owner in IDS:
            for opened in (False, True):
                rig = Rig(); rig.ready(); rig.scan({'REQUEST_'+owner:True})
                if opened: rig.scan({'CLOSED_'+owner:False,'REQUEST_'+owner:False})
                for mask in range(128):
                    rig.scan({'REQUEST_'+d: d==owner and not opened for d in IDS},dt=1)
                    rig.scan({'REQUEST_'+d: (d==owner and not opened) or bool(mask&(1<<i)) for i,d in enumerate(IDS)},dt=1)
                    for d in IDS:
                        if conflicts(d,owner): self.assertFalse(rig.value[field('PERMIT',d)])
                    self.assertTrue(rig.value[field('RESERVED',owner)])
                    checked += 1
        self.assertEqual(checked, 1792)

    def test_each_door_only_resets_incident_timers_and_full_reopen_hold(self):
        for door in IDS:
            rig=Rig(); rig.ready(); rig.scan({'CLOSED_'+door:False})
            for g in GROUPS:
                self.assertEqual(rig.value['READY_'+g['roomId']], door not in g['doorIds'])
            rig.scan({'CLOSED_'+door:True},dt=20)
            rig.scan(dt=9999)
            for g in GROUPS:
                if door in g['doorIds']: self.assertFalse(rig.value['READY_'+g['roomId']])
            rig.scan({'CLOSED_'+door:False},dt=1)
            rig.scan({'CLOSED_'+door:True},dt=1)
            rig.scan(dt=9999)
            for g in GROUPS:
                if door in g['doorIds']: self.assertFalse(rig.value['READY_'+g['roomId']])
            rig.scan(dt=1)
            self.assertTrue(all(rig.value['READY_'+g['roomId']] for g in GROUPS))

    def test_expiry_release_and_opening_at_expiry_preserve_owner(self):
        for door in IDS:
            rig=Rig(); rig.ready(); rig.scan({'REQUEST_'+door:True})
            self.assertTrue(rig.scan(dt=4999)[field('PERMIT',door)])
            self.assertFalse(rig.scan(dt=1)[field('PERMIT',door)])
            self.assertTrue(rig.scan({'CLOSED_'+door:False,'REQUEST_'+door:False})[field('RESERVED',door)])
            rig.scan({'CLOSED_'+door:True},dt=1)
            self.assertFalse(rig.value[field('RESERVED',door)])
            rig.scan(dt=10000)
            self.assertTrue(rig.scan({'REQUEST_'+door:True})[field('PERMIT',door)])
            self.assertFalse(rig.scan({'REQUEST_'+door:False})[field('RESERVED',door)])
            self.assertTrue(rig.scan({'REQUEST_'+door:True})[field('PERMIT',door)])

    def test_denied_edges_during_reservation_and_cancel_scan_are_not_queued(self):
        a,b=IDS[0],IDS[1]
        rig=Rig(); rig.ready(); rig.scan({'REQUEST_'+a:True})
        rig.scan({'REQUEST_'+a:False,'REQUEST_'+b:True})
        self.assertEqual(rig.grants(),[])
        rig.scan(dt=10000); self.assertEqual(rig.grants(),[])
        rig.scan({'REQUEST_'+b:False})
        self.assertTrue(rig.scan({'REQUEST_'+b:True})[field('PERMIT',b)])

    def test_startup_high_and_dwell_edges_are_consumed_for_all_doors(self):
        for door in IDS:
            rig=Rig(); rig.ready({'REQUEST_'+door:True})
            self.assertEqual(rig.grants(),[])
            rig.scan({'REQUEST_'+door:False})
            self.assertTrue(rig.scan({'REQUEST_'+door:True})[field('PERMIT',door)])
        rig=Rig(); rig.scan(INITIAL); rig.scan({'REQUEST_'+IDS[0]:True},dt=9999)
        rig.scan(dt=1); self.assertEqual(rig.grants(),[])

    def test_every_conflicting_physical_pair_latches_fault_and_reset_is_gated(self):
        for a,b in itertools.combinations(IDS,2):
            if not conflicts(a,b): continue
            rig=Rig(); rig.ready()
            self.assertTrue(rig.scan({'CLOSED_'+a:False,'CLOSED_'+b:False,'RESET':True})['FAULT'])
            self.assertTrue(rig.scan({'CLOSED_'+a:True,'CLOSED_'+b:True},dt=20000)['FAULT'])
            rig.scan({'RESET':False,'REQUEST_'+a:True})
            self.assertTrue(rig.scan({'RESET':True})['FAULT'])
            rig.scan({'RESET':False,'REQUEST_'+a:False})
            self.assertFalse(rig.scan({'RESET':True})['FAULT'])
            rig.scan({'RESET':False},dt=1)
            rig.scan(dt=9999); self.assertEqual(rig.grants(),[])
            self.assertFalse(rig.value['READY_'+GROUPS[0]['roomId']])
            rig.scan(dt=1)
            self.assertTrue(rig.scan({'REQUEST_'+a:True})[field('PERMIT',a)])

    def test_overtime_exact_30s_and_closure_for_each_door(self):
        for door in IDS:
            rig=Rig(); rig.ready(); rig.scan({'CLOSED_'+door:False})
            self.assertFalse(rig.scan(dt=29999)['BUZZER'])
            self.assertTrue(rig.scan(dt=1)['BUZZER'])
            self.assertTrue(rig.value[field('OVERTIME',door)])
            self.assertFalse(rig.scan({'CLOSED_'+door:True})['BUZZER'])

    def test_fault_and_fire_recovery_do_not_autoregrant(self):
        for signal in ('FIRE_NORMAL','DATA_HEALTHY'):
            rig=Rig();rig.ready();rig.scan({'REQUEST_'+IDS[0]:True})
            self.assertTrue(rig.scan({signal:False})['FAULT'])
            self.assertEqual(rig.grants(),[])
            self.assertTrue(rig.scan({signal:True,'RESET':True})['FAULT'])
            rig.scan({'REQUEST_'+IDS[0]:False,'RESET':False})
            self.assertFalse(rig.scan({'RESET':True})['FAULT'])
            rig.scan({'RESET':False},dt=20);rig.scan(dt=10000)
            self.assertEqual(rig.grants(),[])
            self.assertTrue(rig.scan({'REQUEST_'+IDS[0]:True})[field('PERMIT',IDS[0])])

    def test_invalid_state_and_reset_same_scan_fault_dominates(self):
        rig=Rig();rig.ready()
        rig.runtime.set_local_for_fault_injection('S_'+IDS[0],1234)
        self.assertTrue(rig.scan({'RESET':True})['FAULT'])
        rig.scan({'RESET':False})
        self.assertFalse(rig.scan({'RESET':True})['FAULT'])

    def test_seeded_adverse_sequences_with_repeated_live_recovery(self):
        rig=Rig();rig.ready();rng=random.Random(28);grants=0
        for i in range(1500):
            phase=i%50
            if phase in (0,1,2): changes={**INITIAL,'RESET':phase==1}
            elif phase==3: changes={**INITIAL,**{'REQUEST_'+d:True for d in IDS}}
            else:
                changes={**{'CLOSED_'+d:rng.random()>.15 for d in IDS},
                         **{'REQUEST_'+d:rng.random()>.6 for d in IDS},
                         'FIRE_NORMAL':i%173!=0,'DATA_HEALTHY':i%137!=0,'RESET':False}
            rig.scan(changes,dt=10000 if phase==3 else 20)
            grants+=len(rig.grants())
        self.assertGreaterEqual(grants,30)


if __name__=='__main__':
    print(QUALIFICATION, 'actual 7-door ST; 128 exact grant sets + 1792 occupied masks',flush=True)
    unittest.main(testRunner=unittest.TextTestRunner(stream=sys.stdout,verbosity=2))
