import json
import glob
import os
import colorsys

# --- CONFIGURATION ---
INPUT_DIR = "./cluster_results/"  # Where your cluster_0.jsonl, cluster_1.jsonl live
OUTPUT_FILE = "./miccai_viz_data.json"

# --- HELPER: COLOR GENERATOR ---
def generate_hsl_palette(n_clusters):
    """
    Generates 'n' distinct HSL colors. 
    We use the Golden Angle approximation to ensure colors are well-separated.
    """
    colors = []
    for i in range(n_clusters):
        # Calculate Hue (0 to 360)
        # Using simple spacing: (i * 360 / n) is okay, 
        # but (i * 137.5) % 360 (Golden Angle) often looks more distinct for adjacent IDs.
        hue = int((i * 360) / n_clusters) 
        
        # Saturation and Lightness fixed for consistency, or vary slightly
        saturation = "70%"
        lightness = "50%" 
        
        colors.append(f"hsl({hue}, {saturation}, {lightness})")
    return colors

# --- HELPER: INSTITUTION NORMALIZER ---
# This is where you tame the "messy" data. Start with a simple map.
INSTITUTION_MAP = {
    "Harvard Medical School": ("Harvard University", "North America"),
    "Harvard Univ.": ("Harvard University", "North America"),
    "BWH, Harvard": ("Harvard University", "North America"),
    "TUM": ("Technical University of Munich", "Europe"),
    "Techn. Univ. München": ("Technical University of Munich", "Europe"),
    "Johns Hopkins University": ("JHU", "North America"),
    "Shanghai Jiao Tong University": ("SJTU", "Asia"),
    # Add more as you discover them
}

def normalize_metadata(item):
    """
    Standardizes Institution and Region.
    Returns (normalized_inst, region)
    """
    raw_inst = item.get("institution", "Unknown")
    
    # 1. Direct Lookup
    if raw_inst in INSTITUTION_MAP:
        return INSTITUTION_MAP[raw_inst]
    
    # 2. Simple Heuristics (Start small!)
    # If not in map, default to the raw value and a generic region
    # You can expand this logic later (e.g., check if "China" in country field)
    
    region = "Other"
    country = item.get("country", "")
    
    if country in ["China", "Japan", "Korea", "Singapore", "India"]:
        region = "Asia"
    elif country in ["USA", "Canada"]:
        region = "North America"
    elif country in ["Germany", "UK", "France", "Italy", "Spain"]:
        region = "Europe"
        
    return raw_inst, region

# --- MAIN EXECUTION ---
def main():
    all_points = []
    
    # 1. Identify all cluster files
    file_list = glob.glob(os.path.join(INPUT_DIR, "cluster_*.jsonl"))
    total_clusters = len(file_list)
    
    # 2. Pre-calculate Colors (So cluster 0 is always the same color)
    color_map = generate_hsl_palette(total_clusters)
    
    print(f"Found {total_clusters} cluster files. Processing...")

    for file_path in file_list:
        # Extract cluster ID from filename (assuming 'cluster_5.jsonl')
        try:
            filename = os.path.basename(file_path)
            # Split 'cluster_5.jsonl' -> '5'
            cluster_id = int(filename.replace("cluster_", "").replace(".jsonl", ""))
        except ValueError:
            print(f"Skipping weird filename: {filename}")
            continue

        base_color = color_map[cluster_id]

        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                raw_item = json.loads(line)
                
                # NORMALIZE
                norm_inst, norm_region = normalize_metadata(raw_item)
                
                # RESTRUCTURE
                # Note: This assumes your input JSONL has 'x' and 'y'. 
                # If 'x'/'y' are in a separate UMAP file, you must merge them here.
                processed_item = {
                    "id": raw_item.get("id"),
                    "x": float(raw_item.get("x", 0.0)), # Ensure float
                    "y": float(raw_item.get("y", 0.0)),
                    "base_color": base_color,
                    "title": raw_item.get("title", "No Title"),
                    "abstract": raw_item.get("abstract", ""),
                    "year": raw_item.get("year"),
                    "institution": norm_inst,
                    "region": norm_region, # This is your new "Country/Region" field
                    "filename": raw_item.get("filename"),
                    "topic_id": cluster_id,
                    "authors": raw_item.get("authors", [])
                }
                
                all_points.append(processed_item)

    # 3. Save Final JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_points, f, indent=2) # indent=2 makes it readable for debugging
        
    print(f"Success! Saved {len(all_points)} papers to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()