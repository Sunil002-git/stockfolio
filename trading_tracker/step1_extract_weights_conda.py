"""
STEP 1 — Run this in your CONDA environment (Keras 3.x)
========================================================
This extracts ONLY the weights from the Keras 3.x model
and saves them in a format Keras 2.10 can load.

Run:
  conda activate <your-env>
  cd path/to/stock-prediction-portal/backend-drf/
  python step1_extract_weights_conda.py
"""

import numpy as np
import keras
import json

print(f"Keras version: {keras.__version__}")

# Load model
print("Loading model...")
model = keras.models.load_model('stock_prediction_model.keras')
print(f"Input shape:  {model.input_shape}")
print(f"Output shape: {model.output_shape}")
print(f"Layers: {len(model.layers)}")

# Print layer info so we can rebuild in Keras 2.10
print("\n--- Layer Summary ---")
layer_info = []
for i, layer in enumerate(model.layers):
    cfg = layer.get_config()
    info = {
        'index': i,
        'name': layer.name,
        'class': layer.__class__.__name__,
        'config': cfg,
    }
    layer_info.append(info)
    print(f"  [{i}] {layer.__class__.__name__}: {layer.name}")
    # Print key config values
    for key in ['units', 'return_sequences', 'activation', 'rate', 'filters', 'kernel_size']:
        if key in cfg:
            print(f"       {key}: {cfg[key]}")

# Save layer info as JSON
with open('model_architecture.json', 'w') as f:
    # Convert non-serializable objects to strings
    def make_serializable(obj):
        if isinstance(obj, dict):
            return {k: make_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [make_serializable(v) for v in obj]
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        else:
            try:
                json.dumps(obj)
                return obj
            except:
                return str(obj)
    json.dump(make_serializable(layer_info), f, indent=2)

# Save weights as numpy arrays
print("\nExtracting weights...")
weights_data = {}
for layer in model.layers:
    w = layer.get_weights()
    if w:
        weights_data[layer.name] = [arr.tolist() for arr in w]
        print(f"  Saved weights for: {layer.name} — shapes: {[arr.shape for arr in w]}")

np.save('model_weights.npy', weights_data)

print("\n✅ Done! Files created:")
print("  - model_architecture.json  (layer structure)")
print("  - model_weights.npy        (trained weights)")
print("\nCopy BOTH files next to manage.py in your Django project.")
