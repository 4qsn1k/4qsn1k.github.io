#!/usr/bin/env python3
"""Emit isolated TEST OWLE from captured vendor primitives. No ST or equipment I/O.
The PR100 capture is the ONLY supported device envelope. Compilation is external.
"""
import argparse, copy, hashlib, json, pathlib, re, uuid, zipfile
CAPTURE_SHA = '13b67febaee0dbf0f1ea8396ea90d5ad912c9825b40fc7a48e29d5e90ba66884'
UUID = re.compile(r'^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$')
ZERO = '00000000-0000-0000-0000-000000000000'

def element(w):
    return w.get('ElementModel') or w['ElementBlockModel']['ElementModel']

def read_capture(path):
    data = pathlib.Path(path).read_bytes()
    if hashlib.sha256(data).hexdigest() != CAPTURE_SHA:
        raise ValueError('UNRECOGNIZED_GUI_CAPTURE_HASH')
    with zipfile.ZipFile(path) as z:
        if z.namelist() != ['Project']:
            raise ValueError('NO_ST_ONLY_CAPTURE_REQUIRED')
        root = json.loads(z.read('Project'))
    if len(root) != 1:
        raise ValueError('ONE_DOCUMENT_REQUIRED')
    doc = next(iter(root.values()))['DocumentModel']
    templates = {element(w)['Title']: w for w in doc['Elements']}
    expected = {'AND': (18, ['Input0', 'Input1', 'Output2']),
                'OR': (18, ['Input0', 'Input1', 'Output2']),
                'NOT': (18, ['Input0', 'Output1']),
                'TON': (12, ['Input0', 'Output0']),
                'RS': (15, ['Input0', 'Input1', 'Output0']),
                'RTRIG': (13, ['Input0', 'Output0'])}
    for title, (kind, ports) in expected.items():
        w = templates[title]
        if w['Discriminator'] != kind or [p['Name'] for p in element(w)['Ports']] != ports:
            raise ValueError('CAPTURE_PRIMITIVE_CHANGED_' + title)
    # GUI geometry explicitly shows Input0 beside R, Input1 beside S.
    rs = element(templates['RS'])
    labels = {p.get('Text') for p in rs['Primitives']}
    if not {'R', 'S', 'Q'}.issubset(labels):
        raise ValueError('RS_PIN_LABEL_EVIDENCE_MISSING')
    return root, doc, templates

def rewrite_uuids(value, namespace, prefix):
    def uid(x):
        return str(uuid.uuid5(namespace, prefix + x)) if UUID.fullmatch(x) and x != ZERO else x
    if isinstance(value, dict):
        return {uid(k): rewrite_uuids(v, namespace, prefix) for k, v in value.items()}
    if isinstance(value, list):
        return [rewrite_uuids(x, namespace, prefix) for x in value]
    return uid(value) if isinstance(value, str) else value

def move(value, dx, dy):
    if isinstance(value, list):
        for v in value:
            move(v, dx, dy)
    elif isinstance(value, dict):
        for k, v in value.items():
            if k in ('TextStyleModel', 'TextOffset'):
                continue
            if k in ('X', 'StartPointX', 'EndPointX') and isinstance(v, (int, float)):
                value[k] = v + dx
            elif k in ('Y', 'StartPointY', 'EndPointY') and isinstance(v, (int, float)):
                value[k] = v + dy
            else:
                move(v, dx, dy)

def validate_document(doc):
    ids, ports, endpoints = set(), {}, {}
    def unique(uid):
        if not UUID.fullmatch(uid) or uid == ZERO or uid in ids:
            raise ValueError('DUPLICATE_OR_INVALID_UUID_' + uid)
        ids.add(uid)
    for w in doc['Elements']:
        e = element(w)
        unique(e['UniqueId'])
        anchors = {p['UniqueId']: p for p in e['Primitives'] if 'UniqueId' in p}
        for anchor in anchors:
            unique(anchor)
        for p in e['Ports']:
            unique(p['UniqueId'])
            if p['AnchorUniqueId'] not in anchors:
                raise ValueError('MISSING_ANCHOR')
            ports[p['UniqueId']] = p
            line = anchors[p['AnchorUniqueId']]['LineModel']
            side = 'EndPoint' if p['PortType'] == 1 else 'StartPoint'
            endpoints[p['UniqueId']] = (line[side+'X'], line[side+'Y'])
    drivers = set()
    for w in doc['ConnectorModels']:
        c = w['ConnectorModel']; unique(c['UniqueId'])
        src, dst = c['FromPortUId'], c['ToPortUId']
        if src not in ports or dst not in ports or ports[src]['PortType'] != 1 or ports[dst]['PortType'] != 0:
            raise ValueError('BAD_WIRE_ENDPOINT')
        if dst in drivers:
            raise ValueError('MULTIPLE_DRIVERS')
        drivers.add(dst)
        for uid, point in [(src, c['Points'][0]), (dst, c['Points'][-1])]:
            if (point['X'], point['Y']) != endpoints[uid]:
                raise ValueError('WIRE_GEOMETRY_ENDPOINT_MISMATCH')
    return ports, endpoints

def generate(plan, capture, destination):
    out = pathlib.Path(destination)
    if out.exists() or out.suffix.lower() != '.owle':
        raise ValueError('REFUSE_OVERWRITE_OR_NON_OWLE')
    if plan.get('schema') != 'airlock-reserved-fbd/1' or plan.get('noStructuredText') is not True:
        raise ValueError('RESERVED_FBD_PLAN_REQUIRED')
    root, doc, templates = read_capture(capture)
    connector_template = copy.deepcopy(doc['ConnectorModels'][0])
    if [d['id'] for d in plan['doors']] != ['A', 'B']:
        raise ValueError('CANNOT_FIT_PR100_CAPTURE: seven-door target requires GUI-saved PR102/PR103+PRM device envelope; never clone extra I/O')
    inputs = {'CLOSED_A':'I1', 'CLOSED_B':'I2', 'REQUEST_A':'I3', 'REQUEST_B':'I4',
              'FIRE_NORMAL':'I5', 'RESET':'I6', 'DATA_HEALTHY':'I7'}
    outputs = {'PERMIT_A':'Q1', 'PERMIT_B':'Q2', 'BUZZER':'Q3', 'FAULT_LATCH':'Q4'}
    nodes = {n['id']: n for n in plan['nodes']}
    if len(nodes) != len(plan['nodes']):
        raise ValueError('DUPLICATE_PLAN_NODE')
    drivers = {}
    for edge in plan['edges']:
        node_id, pin = edge['to'].split('.')
        if edge['from'] not in nodes or node_id not in nodes or pin not in nodes[node_id]['inputs']:
            raise ValueError('INVALID_PLAN_EDGE')
        if edge['to'] in drivers:
            raise ValueError('MULTIPLE_PLAN_DRIVERS')
        drivers[edge['to']] = edge['from']
    for n in nodes.values():
        for pin in n['inputs']:
            if n['id']+'.'+pin not in drivers:
                raise ValueError('UNWIRED_PLAN_INPUT')
    namespace = uuid.UUID(doc['UniqueId'])
    digest = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    elements, connections, refs, counters = [], [], {}, {}
    timer_counts = {}
    def clone(title, logical, x, y):
        w = rewrite_uuids(copy.deepcopy(templates[title]), namespace, logical)
        e = element(w); loc = e['Location']
        move(e, x-loc['X'], y-loc['Y']); e['ZOrder'] = len(elements)
        e['Comment'] = logical + ' | TEST_ONLY_NOT_FOR_PLC'
        if 'ElementBlockModel' in w:
            counters[title] = counters.get(title, 0)+1
            w['ElementBlockModel']['Identificator'] = counters[title]
            for primitive in e['Primitives']:
                if primitive.get('Name') == 'textIdentificator':
                    primitive['Text'] = title + str(counters[title])
        elements.append(w)
        return w
    def port(w, name):
        return next(p['UniqueId'] for p in element(w)['Ports'] if p['Name'] == name)
    def connect(src, dst):
        connections.append((src, dst))
    # Preserve genuine unused device elements, including their hardware indexes.
    device = {}
    for title in [f'I{i}' for i in range(1,9)]+['Q1','Q2','Q3','Q4','F1','F2']:
        is_input = title.startswith('I'); index = int(title[1:])-1+(4 if title.startswith('F') else 0)
        w = clone(title, 'DEVICE_'+title, 0 if is_input else 1000, index*25)
        device[title] = w
    for logical, title in inputs.items():
        refs[logical] = port(device[title], 'Output0')
    pending = []
    position = 0
    for n in plan['nodes']:
        kind, logical = n['kind'], n['id']
        if kind in ('INPUT', 'OUTPUT'):
            continue
        if kind not in ('AND','OR','NOT','TON','RS','R_TRIG'):
            raise ValueError('UNSUPPORTED_PRIMITIVE_' + kind)
        args = [drivers[logical+'.'+p] for p in n['inputs']]
        if kind in ('AND','OR'):
            # Vendor-saved two-input gates ONLY: lower wider gates to a chain.
            if len(args) < 2:
                raise ValueError('BAD_GATE_ARITY')
            previous = args[0]
            for i in range(1,len(args)):
                sub = logical if i == len(args)-1 else logical+'_PART_'+str(i)
                w = clone(kind, sub, 60+(position%16)*55, (position//16)*35)
                position += 1
                pending.extend([(previous, port(w,'Input0')), (args[i], port(w,'Input1'))])
                refs[sub] = port(w,'Output2'); previous = sub
            continue
        title = 'RTRIG' if kind == 'R_TRIG' else kind
        w = clone(title, logical, 60+(position%16)*55, (position//16)*35);position += 1
        if kind == 'RS':
            # Actual vendor RS: Input0=R, Input1=S, not inferred S,R ordering.
            pending.extend([(drivers[logical+'.R'],port(w,'Input0')), (drivers[logical+'.S'],port(w,'Input1'))])
        else:
            if len(args) != 1:
                raise ValueError('BAD_UNARY_ARITY')
            pending.append((args[0],port(w,'Input0')))
        refs[logical] = port(w,'Output1' if kind == 'NOT' else 'Output0')
        if kind == 'TON':
            ms = n['presetMs']
            if ms not in (5000,10000,30000):
                raise ValueError('UNQUALIFIED_TIMER_PRESET')
            w['ImpulseTime'] = ms//1000; w['TimeScale'] = templates['TON']['TimeScale']
            for primitive in element(w)['Primitives']:
                if primitive.get('TextModel',{}).get('Name') == 'textPrimitiveT':
                    primitive['TextModel']['Text'] = str(ms//1000)+'с'
            timer_counts[str(ms)] = timer_counts.get(str(ms),0)+1
    for logical, title in outputs.items():
        pending.append((drivers[logical+'.IN'],port(device[title],'Input0')))
    for src, dst in pending:
        if src not in refs:
            raise ValueError('MISSING_NATIVE_SOURCE_' + src)
        connect(refs[src],dst)
    doc['Elements'] = elements;doc['ConnectorModels'] = []
    _, endpoints = validate_document(doc)
    for i,(src,dst) in enumerate(connections):
        # Connector wrapper and routing keys are copied from the GUI capture.
        wire = copy.deepcopy(connector_template)
        c = wire['ConnectorModel'];c['UniqueId'] = str(uuid.uuid5(namespace,'wire'+str(i)+digest))
        c['FromPortUId'],c['ToPortUId'],c['ZOrder'] = src,dst,len(elements)+i
        x1,y1 = endpoints[src];x2,y2 = endpoints[dst]
        c['Points'] = [{'IsEmpty':False,'X':x,'Y':y} for x,y in [(x1,y1),((x1+x2)/2,y1),((x1+x2)/2,y2),(x2,y2)]]
        doc['ConnectorModels'].append(wire)
    # Existing bounds record shape; all drawing fits inside these limits.
    width,height = 1040,max(300,(position//16+1)*35)
    for key in ('Bounds','WorkRectangle'):
        rect = doc[key];rect.update(X=0,Y=0,Width=width,Height=height,Left=0,Top=0,Right=width,Bottom=height,IsEmpty=False)
        rect['Location'].update(X=0,Y=0,IsEmpty=True);rect['Size'].update(Width=width,Height=height,IsEmpty=False)
    validate_document(doc)
    # Give all project/variable/port/anchor IDs fresh deterministic identities together.
    final = rewrite_uuids(root,namespace,'issue28:'+digest)
    final_doc = next(iter(final.values()))['DocumentModel'];validate_document(final_doc)
    with out.open('xb') as stream:
        with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:
            info = zipfile.ZipInfo('Project',(2026,10,20,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            # Pin platform metadata: the same CLI must emit identical bytes on Windows.
            info.create_system = 3;info.external_attr = 0o600 << 16
            z.writestr(info,json.dumps(final,ensure_ascii=False,separators=(',',':')).encode())
    return {'status':'NATIVE_GUI_NOT_VERIFIED','noStructuredText':True,'device':'PR100ED1',
            'captureSha256':CAPTURE_SHA,'planSha256':digest,'owleSha256':hashlib.sha256(out.read_bytes()).hexdigest(),
            'nativeElements':len(elements),'nativeWires':len(connections),'timers':timer_counts,
            'inputMap':inputs,'outputMap':outputs,'physicalTerminalsAssigned':False,
            'scanContractVerified':False,'compileVerified':False,'simulatorVerified':False}

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--plan',required=True);parser.add_argument('--capture',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(generate(json.loads(pathlib.Path(args.plan).read_text()),args.capture,args.output),indent=2))
    except (ValueError,KeyError,AssertionError) as exc:
        parser.exit(2,'NATIVE_EXPORT_REFUSED '+str(exc)+'\n')
