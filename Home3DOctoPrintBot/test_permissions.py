import unittest
from bot import Bot


class FakeTelegram:
    def __init__(self):
        self.messages = []
        self.photos = []
        self.downloads = 0

    def message(self, chat_id, text):
        self.messages.append((chat_id, text))

    def photo(self, chat_id, blob):
        self.photos.append((chat_id, blob))

    def document_bytes(self, file_id):
        self.downloads += 1
        return b'G28\n'


class FakeOctoPrint:
    def __init__(self):
        self.calls = []

    def snapshot(self):
        self.calls.append('snapshot')
        return b'\xff\xd8\xfffake'

    def get(self, path):
        self.calls.append(('get', path))
        if path == '/api/job':
            return {'job': {}, 'progress': {}}
        if path == '/api/printer':
            return {'temperature': {}, 'state': {'text':'Operational'}}
        return {'files': []}

    def post_json(self, path, data):
        self.calls.append(('post', path, data))
        return {}

    def upload(self, filename, data):
        self.calls.append(('upload',filename,len(data)))
        return {}


def make_msg(user_id, content=None, chat_type='private'):
    msg = {'from': {'id':user_id}, 'chat': {'id':user_id, 'type':chat_type}}
    msg.update(content or {})
    return msg


class TestAcl(unittest.TestCase):
    def setUp(self):
        self.tg=FakeTelegram()
        self.op=FakeOctoPrint()
        self.bot=Bot(self.tg,self.op,111)

    def test_all_other_users_denied(self):
        for other in (222, 333):
            for txt in ('/start', '/photo', '/status', '/files', '/pause', '/resume', '/print demo.gcode', '/confirmprint', '/cancel', '/confirmcancel'):
                self.bot.process(make_msg(other, {'text':txt}))
            self.bot.process(make_msg(other, {'document':{'file_name':'test.gcode','file_id':'abc'}}))
        for kind in ('group', 'supergroup', 'channel'):
            self.bot.process(make_msg(111, {'text':'/photo'}, kind))
        self.assertEqual(self.op.calls, [])
        self.assertEqual(self.tg.photos, [])
        self.assertEqual(self.tg.messages, [])
        self.assertEqual(self.tg.downloads, 0)

    def test_owner_photo(self):
        self.bot.process(make_msg(111, {'text':'/photo'}))
        self.assertEqual(self.op.calls, ['snapshot'])
        self.assertEqual(len(self.tg.photos), 1)

    def test_admin_status(self):
        self.bot.process(make_msg(111, {'text':'/status'}))
        self.assertEqual(self.op.calls[:2], [('get','/api/job'),('get','/api/printer')])

    def test_print_requires_confirmation(self):
        self.bot.process(make_msg(111, {'text':'/print demo.gcode'}))
        self.assertEqual(self.op.calls, [])
        self.bot.process(make_msg(111, {'text':'/confirmprint'}))
        self.assertEqual(self.op.calls, [('post','/api/files/local/demo.gcode', {'command':'select','print':True})])

    def test_cancel_requires_confirmation(self):
        self.bot.process(make_msg(111, {'text':'/cancel'}))
        self.assertEqual(self.op.calls, [])
        self.bot.process(make_msg(111, {'text':'/confirmcancel'}))
        self.assertEqual(self.op.calls, [('post','/api/job', {'command':'cancel'})])


if __name__=='__main__':
    unittest.main()