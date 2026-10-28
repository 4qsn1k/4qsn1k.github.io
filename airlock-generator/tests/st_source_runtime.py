"""Strict test-only interpreter for this task's small ST source subset.

HOST_ST_SUBSET_ONLY_NOT_OWEN: this is neither an IEC compiler nor a vendor
runtime. It executes the checked-in source statements with timestamp-based TON
test doubles, to catch source/control-flow regressions independently of JS FBD.
Unknown syntax is rejected rather than skipped. Native Owen QA remains required.
"""

from dataclasses import dataclass
import re


QUALIFICATION = "HOST_ST_SUBSET_ONLY_NOT_OWEN"


class STError(ValueError):
    pass


def tokenize(source):
    tokens = []
    offset = 0
    pattern = re.compile(
        r"\s+|//[^\n]*(?:\n|$)|\(\*[\s\S]*?\*\)|"
        r"T#\d+(?:ms|s)\b|[A-Za-z_][A-Za-z0-9_]*|\d+|"
        r":=|<=|>=|<>|[():;,.=<>+\-]", re.IGNORECASE
    )
    while offset < len(source):
        match = pattern.match(source, offset)
        if not match:
            line = source.count("\n", 0, offset) + 1
            raise STError(f"UNKNOWN_TOKEN line {line}: {source[offset:offset+30]!r}")
        value = match.group()
        if not value.isspace() and not value.startswith(("//", "(*")):
            tokens.append(value.upper())
        offset = match.end()
    return tokens + ["<EOF>"]


@dataclass
class Variable:
    name: str
    kind: str
    section: str
    initial: object


class Parser:
    OPERATORS = {"OR": 1, "AND": 2, "=": 3, "<>": 3,
                 "<": 3, ">": 3, "<=": 3, ">=": 3, "+": 4, "-": 4}

    def __init__(self, source):
        self.tokens = tokenize(source)
        self.pos = 0
        self.variables = {}

    @property
    def current(self):
        return self.tokens[self.pos]

    def take(self, expected=None):
        result = self.current
        if expected is not None and result != expected:
            raise STError(f"EXPECTED_{expected} got {result} token {self.pos}")
        self.pos += 1
        return result

    def identifier(self):
        value = self.take()
        if not re.fullmatch(r"[A-Z_][A-Z0-9_]*", value):
            raise STError(f"EXPECTED_IDENTIFIER got {value}")
        return value

    def parse(self):
        self.take("FUNCTION_BLOCK")
        self.name = self.identifier()
        while self.current in ("VAR_INPUT", "VAR_OUTPUT", "VAR"):
            section = self.take()
            while self.current != "END_VAR":
                names = [self.identifier()]
                while self.current == ",":
                    self.take(",")
                    names.append(self.identifier())
                self.take(":")
                kind = self.take()
                if kind == "SYS":
                    self.take(".")
                    self.take("TON")
                    kind = "SYS.TON"
                if kind not in ("BOOL", "UDINT", "SYS.TON"):
                    raise STError(f"UNSUPPORTED_TYPE {kind}")
                initial = False if kind == "BOOL" else 0
                if self.current == ":=":
                    self.take(":=")
                    value = self.take()
                    if kind == "BOOL" and value in ("TRUE", "FALSE"):
                        initial = value == "TRUE"
                    elif kind == "UDINT" and value.isdigit():
                        initial = int(value)
                    else:
                        raise STError(f"UNSUPPORTED_INITIALIZER {kind} {value}")
                self.take(";")
                for name in names:
                    if name in self.variables:
                        raise STError(f"DUPLICATE_VARIABLE {name}")
                    self.variables[name] = Variable(name, kind, section, initial)
            self.take("END_VAR")
        self.statements = self.block({"END_FUNCTION_BLOCK"})
        self.take("END_FUNCTION_BLOCK")
        if self.current == ";":
            self.take(";")
        self.take("<EOF>")
        return self

    def block(self, stops, case_body=False):
        result = []
        while self.current not in stops:
            if self.current == "<EOF>":
                raise STError("UNEXPECTED_EOF")
            if case_body and self.current.isdigit():
                break
            result.append(self.statement())
        return result

    def statement(self):
        if self.current == "IF":
            self.take("IF")
            condition = self.expression()
            self.take("THEN")
            branches = [(condition, self.block({"ELSIF", "ELSE", "END_IF"}))]
            while self.current == "ELSIF":
                self.take("ELSIF")
                condition = self.expression()
                self.take("THEN")
                branches.append((condition, self.block({"ELSIF", "ELSE", "END_IF"})))
            otherwise = []
            if self.current == "ELSE":
                self.take("ELSE")
                otherwise = self.block({"END_IF"})
            self.take("END_IF")
            self.take(";")
            return ("if", branches, otherwise)
        if self.current == "CASE":
            self.take("CASE")
            value = self.expression()
            self.take("OF")
            branches = {}
            while self.current.isdigit():
                labels = [int(self.take())]
                while self.current == ",":
                    self.take(",")
                    number = self.take()
                    if not number.isdigit():
                        raise STError("EXPECTED_NUMERIC_CASE_LABEL")
                    labels.append(int(number))
                self.take(":")
                body = self.block({"ELSE", "END_CASE"}, case_body=True)
                for label in labels:
                    if label in branches:
                        raise STError("DUPLICATE_CASE_LABEL")
                    branches[label] = body
            otherwise = []
            if self.current == "ELSE":
                self.take("ELSE")
                otherwise = self.block({"END_CASE"})
            self.take("END_CASE")
            self.take(";")
            return ("case", value, branches, otherwise)
        name = self.identifier()
        variable = self.variables.get(name)
        if variable is None:
            raise STError(f"UNDECLARED_VARIABLE {name}")
        if self.current == ":=":
            if variable.section == "VAR_INPUT" or variable.kind == "SYS.TON":
                raise STError(f"INVALID_ASSIGNMENT_TARGET {name}")
            self.take(":=")
            value = self.expression()
            self.take(";")
            return ("assign", name, value)
        if variable.kind != "SYS.TON":
            raise STError(f"UNSUPPORTED_CALL {name}")
        self.take("(")
        arguments = {}
        while self.current != ")":
            key = self.take()
            if key not in ("I", "T") or key in arguments:
                raise STError(f"UNSUPPORTED_TIMER_ARGUMENT {key}")
            self.take(":=")
            arguments[key] = self.expression()
            if self.current != ")":
                self.take(",")
        if set(arguments) != {"I", "T"}:
            raise STError("TIMER_REQUIRES_I_AND_T")
        self.take(")")
        self.take(";")
        return ("ton", name, arguments)

    def expression(self, minimum=0):
        token = self.take()
        if token == "NOT":
            left = ("not", self.expression(5))
        elif token == "(":
            left = self.expression()
            self.take(")")
        elif token in ("TRUE", "FALSE"):
            left = ("literal", token == "TRUE")
        elif token.isdigit():
            left = ("literal", int(token))
        elif re.fullmatch(r"T#\d+(MS|S)", token):
            suffix = "MS" if token.endswith("MS") else "S"
            left = ("time", int(token[2:-len(suffix)]) * (1 if suffix == "MS" else 1000))
        elif token in self.variables:
            if self.current == ".":
                self.take(".")
                self.take("Q")
                if self.variables[token].kind != "SYS.TON":
                    raise STError(f"Q_ON_NON_TIMER {token}")
                left = ("q", token)
            else:
                if self.variables[token].kind == "SYS.TON":
                    raise STError(f"BARE_TIMER_REFERENCE {token}")
                left = ("ref", token)
        else:
            raise STError(f"UNSUPPORTED_EXPRESSION {token}")
        while self.current in self.OPERATORS and self.OPERATORS[self.current] >= minimum:
            operator = self.take()
            right = self.expression(self.OPERATORS[operator] + 1)
            left = ("binary", operator, left, right)
        return left


class Runtime:
    qualification = QUALIFICATION

    def __init__(self, source):
        self.program = Parser(source).parse()
        self.values = {name: variable.initial for name, variable in self.program.variables.items()
                       if variable.kind != "SYS.TON"}
        self.timers = {name: {"since": None, "q": False, "calls": 0}
                       for name, variable in self.program.variables.items() if variable.kind == "SYS.TON"}
        self.now_ms = None

    @staticmethod
    def boolean(value):
        if type(value) is not bool:
            raise STError(f"EXPECTED_BOOL got {value!r}")
        return value

    @staticmethod
    def integer(value):
        if type(value) is not int or not 0 <= value <= 0xFFFFFFFF:
            raise STError(f"EXPECTED_UDINT got {value!r}")
        return value

    def evaluate(self, expression):
        kind = expression[0]
        if kind in ("literal", "time"):
            return expression[1]
        if kind == "ref":
            return self.values[expression[1]]
        if kind == "q":
            return self.timers[expression[1]]["q"]
        if kind == "not":
            return not self.boolean(self.evaluate(expression[1]))
        operator = expression[1]
        left, right = self.evaluate(expression[2]), self.evaluate(expression[3])
        if operator == "AND":
            return self.boolean(left) & self.boolean(right)
        if operator == "OR":
            return self.boolean(left) | self.boolean(right)
        if operator in ("+", "-"):
            a, b = self.integer(left), self.integer(right)
            return self.integer(a + b if operator == "+" else a - b)
        if type(left) is not type(right):
            raise STError("COMPARISON_TYPE_MISMATCH")
        return {"=": lambda: left == right, "<>": lambda: left != right,
                "<": lambda: left < right, ">": lambda: left > right,
                "<=": lambda: left <= right, ">=": lambda: left >= right}[operator]()

    def execute(self, statements):
        for statement in statements:
            kind = statement[0]
            if kind == "assign":
                value = self.evaluate(statement[2])
                check = self.boolean if self.program.variables[statement[1]].kind == "BOOL" else self.integer
                self.values[statement[1]] = check(value)
            elif kind == "if":
                for condition, body in statement[1]:
                    if self.boolean(self.evaluate(condition)):
                        self.execute(body)
                        break
                else:
                    self.execute(statement[2])
            elif kind == "case":
                value = self.integer(self.evaluate(statement[1]))
                self.execute(statement[2].get(value, statement[3]))
            elif kind == "ton":
                timer = self.timers[statement[1]]
                timer["calls"] += 1
                if timer["calls"] != 1:
                    raise STError(f"TIMER_CALLED_TWICE {statement[1]}")
                active = self.boolean(self.evaluate(statement[2]["I"]))
                preset = self.integer(self.evaluate(statement[2]["T"]))
                if not active:
                    timer["since"] = None
                elif timer["since"] is None:
                    timer["since"] = self.now_ms
                timer["q"] = active and self.now_ms - timer["since"] >= preset
            else:
                raise STError(f"UNKNOWN_AST_NODE {kind}")

    def scan(self, inputs=None, now_ms=0):
        if type(now_ms) is not int or now_ms < 0 or (self.now_ms is not None and now_ms < self.now_ms):
            raise STError("INVALID_CLOCK")
        for name, value in (inputs or {}).items():
            name = name.upper()
            variable = self.program.variables.get(name)
            if variable is None or variable.section != "VAR_INPUT":
                raise STError(f"INVALID_INPUT {name}")
            check = self.boolean if variable.kind == "BOOL" else self.integer
            self.values[name] = check(value)
        self.now_ms = now_ms
        for timer in self.timers.values():
            timer["calls"] = 0
        self.execute(self.program.statements)
        for name, timer in self.timers.items():
            if timer["calls"] != 1:
                raise STError(f"TIMER_NOT_CALLED {name}")
        return self.snapshot()

    def snapshot(self):
        return {name: self.values[name] for name, variable in self.program.variables.items()
                if variable.section == "VAR_OUTPUT"}

    def set_local_for_fault_injection(self, name, value):
        name = name.upper()
        variable = self.program.variables.get(name)
        if variable is None or variable.section != "VAR" or variable.kind == "SYS.TON":
            raise STError("INVALID_LOCAL_FAULT_INJECTION")
        check = self.boolean if variable.kind == "BOOL" else self.integer
        self.values[name] = check(value)
