CLASS_NAMES = {
    '(': '(', ')': ')', 'constant_pi': 'π', 'digit_0': '0', 'digit_1': '1', 'digit_2': '2', 'digit_3': '3', 'digit_4': '4',
    'digit_5': '5', 'digit_6': '6', 'digit_7': '7', 'digit_8': '8', 'digit_9': '9', 'function_cos': 'cos',
    'function_integral': '∫', 'function_log': 'log', 'function_sin': 'sin', 'function_sqrt': '√', 'function_tan': 'tan',
    'operator_add': '+', 'operator_divide': '÷', 'operator_equalto': '=', 'operator_multiply': '×', 'operator_sub': '-',
    'variable_a': 'a', 'variable_b': 'b', 'variable_c': 'c', 'variable_x': 'x', 'variable_y': 'y'
}

import os
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ModelFile", "Model.keras")
