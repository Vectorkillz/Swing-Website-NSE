"""Pure, network-free domain engine for the NSE swing scanner.

Rules:
* No I/O, no printing, no network, no globals that change at runtime.
* Every public function takes data structures and returns data structures.
* Only pandas, numpy, pydantic and the standard library may be imported.
"""

ENGINE_VERSION = "0.1.0"
