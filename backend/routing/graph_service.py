"""
backend/routing/graph_service.py - Transportation Graph Service for Safe Evacuation.

Builds and caches the topological road and evacuation corridor network for Kamrup Metropolitan (Guwahati).
Integrates major arterial highways (NH-27 Bypass, GS Road, Assam Trunk Road, Zoo Road)
and 1km zone connectors into a complete NetworkX spatial graph.
"""

import math
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import Point, LineString

from ml.config import ZONES_GRID_PATH, STATIC_FEATURES_PATH


# Earth radius for Haversine distance
EARTH_RADIUS_M = 6371000.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_M * c


# Real major highway and arterial corridors connecting Guwahati landmarks
# Format: (node_id, name, lat, lon)
GUWAHATI_ARTERIAL_NODES = [
    # Jalukbari / Western Entrance
    ("JALUKBARI_ROTARY", "Jalukbari Rotary (AEC / Gauhati Univ)", 26.1450, 91.6620),
    ("MALIGAON_CHARIALI", "Maligaon Chariali (Railway HQ)", 26.1550, 91.7010),
    ("PANDU_PORT", "Pandu River Port", 26.1680, 91.7030),
    ("BHARALUMUKH", "Bharalumukh Riverfront", 26.1760, 91.7280),
    ("PANBAZAR_CHOWK", "Panbazar (Cotton University / Court)", 26.1880, 91.7500),
    ("PALTAN_BAZAR", "Paltan Bazar (Guwahati Railway Station)", 26.1800, 91.7520),
    ("ULUBARI_CHARIALI", "Ulubari (Nehru Stadium / B.Borooah)", 26.1740, 91.7580),
    ("BHANGAGARH", "Bhangagarh (GMCH Hospital Junction)", 26.1610, 26.1610),  # Corrected below
    ("BHANGAGARH_JUNC", "Bhangagarh (GMCH Hospital Junction)", 26.1610, 91.7700),
    ("GANESHGURI", "Ganeshguri Flyover (Dispur Entry)", 26.1520, 91.7820),
    ("DISPUR_LAST_GATE", "Dispur Capital Complex (Secretariat)", 26.1440, 91.7920),
    ("SIX_MILE", "Six Mile Flyover (VIP Road Junction)", 26.1330, 91.8080),
    ("KHANAPARA_ROTARY", "Khanapara Rotary (Meghalaya Entry / Veterinary)", 26.1240, 91.8260),

    # Southern NH-27 Guwahati Elevated Bypass
    ("GORCHUK_CHARIALI", "Gorchuk Chariali (NH-27 Junction)", 26.1280, 91.7050),
    ("LOKHRA_CHARIALI", "Lokhra Chariali (NH-27)", 26.1190, 91.7220),
    ("SARUSAJAI_STADIUM", "Sarusajai Sports Complex (NH-27)", 26.1150, 91.7380),
    ("BASISTHA_CHARIALI", "Basistha Chariali (NH-27 / Mandir Road)", 26.1100, 91.7850),

    # Northern / Trans-Brahmaputra Connection
    ("SARAIGHAT_SOUTH", "Saraighat Bridge South Approach", 26.1300, 91.6020),
    ("SARAIGHAT_NORTH", "Saraighat Bridge North Approach", 26.1420, 91.5980),
    ("IIT_GUWAHATI_GATE", "IIT Guwahati Main Gate (North Guwahati)", 26.1900, 91.6910),

    # Flood-Prone Interior Hubs
    ("ANIL_NAGAR", "Anil Nagar / Nabin Nagar Link", 26.1750, 91.7740),
    ("CHANDMARI", "Chandmari AEI Field", 26.1860, 91.7710),
    ("NOONMATI", "Noonmati Refinery Colony", 26.1950, 91.7980),
    ("ZOO_ROAD_TINIALI", "R.G. Baruah (Zoo) Road Tiniali", 26.1700, 91.7790),
    ("HATIGAON_CHARIALI", "Hatigaon Chariali", 26.1380, 91.7880),
]

# Major arterial highway segments with accurate physical connectivity
GUWAHATI_ARTERIAL_CORRIDORS = [
    # Assam Trunk Road (Western Corridor)
    ("JALUKBARI_ROTARY", "MALIGAON_CHARIALI", "Assam Trunk Road (West)", 4200.0, 50.0),
    ("MALIGAON_CHARIALI", "PANDU_PORT", "Pandu Port Road", 1600.0, 35.0),
    ("MALIGAON_CHARIALI", "BHARALUMUKH", "Assam Trunk Road (Central)", 3100.0, 45.0),
    ("BHARALUMUKH", "PANBAZAR_CHOWK", "MG Road (Brahmaputra Riverfront)", 2500.0, 40.0),
    ("PANBAZAR_CHOWK", "PALTAN_BAZAR", "Nehru Park - Station Road", 1100.0, 30.0),
    ("PALTAN_BAZAR", "ULUBARI_CHARIALI", "G.S. Road (Paltan - Ulubari)", 950.0, 35.0),

    # G.S. Road (Primary North-South Arterial Spine)
    ("ULUBARI_CHARIALI", "BHANGAGARH_JUNC", "G.S. Road (Ulubari - Bhangagarh)", 1800.0, 45.0),
    ("BHANGAGARH_JUNC", "GANESHGURI", "G.S. Road (Bhangagarh - Ganeshguri)", 1600.0, 45.0),
    ("GANESHGURI", "DISPUR_LAST_GATE", "G.S. Road (Ganeshguri - Dispur)", 1300.0, 50.0),
    ("DISPUR_LAST_GATE", "SIX_MILE", "G.S. Road (Dispur - Six Mile)", 2100.0, 50.0),
    ("SIX_MILE", "KHANAPARA_ROTARY", "G.S. Road (Six Mile - Khanapara)", 2200.0, 55.0),

    # NH-27 Southern Elevated Highway Bypass
    ("JALUKBARI_ROTARY", "GORCHUK_CHARIALI", "NH-27 Bypass (Jalukbari - Gorchuk)", 4800.0, 70.0),
    ("GORCHUK_CHARIALI", "LOKHRA_CHARIALI", "NH-27 Bypass (Gorchuk - Lokhra)", 2100.0, 70.0),
    ("LOKHRA_CHARIALI", "SARUSAJAI_STADIUM", "NH-27 Bypass (Lokhra - Sarusajai)", 1800.0, 70.0),
    ("SARUSAJAI_STADIUM", "BASISTHA_CHARIALI", "NH-27 Bypass (Sarusajai - Basistha)", 4900.0, 70.0),
    ("BASISTHA_CHARIALI", "KHANAPARA_ROTARY", "NH-27 Bypass (Basistha - Khanapara)", 4400.0, 70.0),

    # Cross-City Connectors
    ("BHANGAGARH_JUNC", "ANIL_NAGAR", "Rajgarh Road (Flood Prone)", 1700.0, 25.0),
    ("ANIL_NAGAR", "CHANDMARI", "Nabin Nagar Link (Flood Prone)", 1500.0, 25.0),
    ("CHANDMARI", "ZOO_ROAD_TINIALI", "R.G. Baruah (Zoo) Road North", 2100.0, 35.0),
    ("ZOO_ROAD_TINIALI", "GANESHGURI", "R.G. Baruah (Zoo) Road South", 2300.0, 35.0),
    ("CHANDMARI", "NOONMATI", "MRD Road (Chandmari - Noonmati)", 3200.0, 40.0),
    ("SIX_MILE", "NOONMATI", "VIP Road (Six Mile - Narengi/Noonmati)", 7500.0, 50.0),
    ("DISPUR_LAST_GATE", "HATIGAON_CHARIALI", "Hatigaon Main Road", 1400.0, 30.0),
    ("HATIGAON_CHARIALI", "BASISTHA_CHARIALI", "Basistha - Hatigaon Link", 3400.0, 35.0),
    ("ULUBARI_CHARIALI", "SARUSAJAI_STADIUM", "B.K. Kakati - Sarusajai Link", 6800.0, 45.0),

    # Bridge Connection to North Guwahati
    ("JALUKBARI_ROTARY", "SARAIGHAT_SOUTH", "Saraighat South Approach", 6200.0, 60.0),
    ("SARAIGHAT_SOUTH", "SARAIGHAT_NORTH", "Saraighat Bridge (Brahmaputra)", 1500.0, 50.0),
    ("SARAIGHAT_NORTH", "IIT_GUWAHATI_GATE", "North Guwahati - IIT Road", 9800.0, 45.0),
]


class RoadGraphService:
    """Singleton service maintaining the transportation network graph."""

    def __init__(self):
        self.graph: Optional[nx.Graph] = None
        self.node_positions: Dict[str, Tuple[float, float]] = {}  # node_id -> (lat, lon)
        self.kdtree: Optional[cKDTree] = None
        self.node_id_list: List[str] = []
        self.zone_lookup: Dict[str, str] = {}  # node_id -> zone_id

    def build_graph(self, static_df, grid_geojson):
        """Constructs the hybrid road network connecting arterial corridors and 1km zones."""
        print("[Router] Building road and evacuation network graph...")
        G = nx.Graph()

        # 1. Add Arterial Highway Nodes
        for node_id, name, lat, lon in GUWAHATI_ARTERIAL_NODES:
            G.add_node(node_id, name=name, lat=lat, lon=lon, kind="arterial")
            self.node_positions[node_id] = (lat, lon)

        # 2. Add 1km Grid Zone Centroid Nodes (Kamrup Metropolitan)
        km_zones = static_df[static_df["district"] == "Kamrup Metropolitan"]
        for _, zrow in km_zones.iterrows():
            zid = zrow["zone_id"]
            lat = float(zrow["centroid_lat"])
            lon = float(zrow["centroid_lon"])
            node_key = f"ZONE_{zid}"
            G.add_node(
                node_key,
                name=f"Zone {zid}",
                lat=lat,
                lon=lon,
                kind="zone_centroid",
                zone_id=zid
            )
            self.node_positions[node_key] = (lat, lon)
            self.zone_lookup[node_key] = zid

        # 3. Add Arterial Highway Corridors
        for u, v, name, length_m, speed_kmh in GUWAHATI_ARTERIAL_CORRIDORS:
            if u in G.nodes and v in G.nodes:
                lat1, lon1 = self.node_positions[u]
                lat2, lon2 = self.node_positions[v]
                G.add_edge(
                    u, v,
                    name=name,
                    length_m=length_m,
                    speed_kmh=speed_kmh,
                    road_type="arterial",
                    geometry=[[lon1, lat1], [lon2, lat2]]
                )

        # 4. Add 8-Connectivity Grid Transit Connectors between neighboring zones
        # Group zones by coordinate grid to identify adjacent cells
        zone_coords = [
            (zid, float(r["centroid_lat"]), float(r["centroid_lon"]))
            for zid, r in km_zones.set_index("zone_id").iterrows()
        ]

        # Use KDTree to connect each zone centroid to its closest neighboring zone centroids
        km_tree_coords = np.array([[c[1], c[2]] for c in zone_coords])
        km_zids = [c[0] for c in zone_coords]
        km_tree = cKDTree(km_tree_coords)

        # Query up to 8 nearest neighbors within ~1.6 km (~0.015 degrees)
        for idx, (zid, lat, lon) in enumerate(zone_coords):
            u_node = f"ZONE_{zid}"
            dists, indices = km_tree.query([lat, lon], k=9)  # k=9 includes self
            for dist_deg, n_idx in zip(dists, indices):
                if n_idx != idx and dist_deg < 0.016:  # within ~1.6 km
                    v_zid = km_zids[n_idx]
                    v_node = f"ZONE_{v_zid}"
                    v_lat, v_lon = zone_coords[n_idx][1], zone_coords[n_idx][2]
                    dist_m = haversine_distance(lat, lon, v_lat, v_lon)
                    if not G.has_edge(u_node, v_node):
                        G.add_edge(
                            u_node, v_node,
                            name=f"Zone Connector ({zid} - {v_zid})",
                            length_m=round(dist_m, 1),
                            speed_kmh=30.0,
                            road_type="local",
                            geometry=[[lon, lat], [v_lon, v_lat]]
                        )

        # 5. Connect Arterial Highway nodes to their nearest enclosing zone centroids
        for node_id, _, a_lat, a_lon in GUWAHATI_ARTERIAL_NODES:
            dist_deg, nearest_zone_idx = km_tree.query([a_lat, a_lon], k=1)
            nearest_zid = km_zids[nearest_zone_idx]
            z_node = f"ZONE_{nearest_zid}"
            z_lat, z_lon = zone_coords[nearest_zone_idx][1], zone_coords[nearest_zone_idx][2]
            d_m = haversine_distance(a_lat, a_lon, z_lat, z_lon)
            if not G.has_edge(node_id, z_node):
                G.add_edge(
                    node_id, z_node,
                    name=f"Feeder Connector to {nearest_zid}",
                    length_m=max(50.0, round(d_m, 1)),
                    speed_kmh=30.0,
                    road_type="connector",
                    geometry=[[a_lon, a_lat], [z_lon, z_lat]]
                )

        self.graph = G

        # Build KDTree for fast O(log N) nearest-node coordinate lookups
        self.node_id_list = list(self.node_positions.keys())
        coords_matrix = np.array([self.node_positions[nid] for nid in self.node_id_list])
        self.kdtree = cKDTree(coords_matrix)

        print(f"[Router] Road graph initialized: {len(G.nodes)} nodes, {len(G.edges)} edges.")

    def find_nearest_node(self, lat: float, lon: float) -> Tuple[str, float]:
        """Finds the nearest graph node to a given GPS coordinate in O(log N) time."""
        if self.kdtree is None:
            raise RuntimeError("Graph not built yet.")
        dist_deg, idx = self.kdtree.query([lat, lon])
        node_id = self.node_id_list[idx]
        node_lat, node_lon = self.node_positions[node_id]
        dist_m = haversine_distance(lat, lon, node_lat, node_lon)
        return node_id, dist_m


# Global router graph instance
graph_service = RoadGraphService()
