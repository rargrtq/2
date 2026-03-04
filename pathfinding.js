
const rotator_table = [1, 2, 3, 3, 3, 3, 3, 3, 4, 3];

function i64_as_f32(var2) {
    const result = Number(var2);
    return Math.fround(result);
}

function i64_extend_i32_u(var2) {
    return BigInt(var2 >>> 0);
}

function decode_packet(packet, header = undefined) {
    let packet_read_index = 0;
    let remaining_packet_len = packet.length;
    let decoded_packet = [];
    let offsets = [];

    if (header) {
        packet_read_index = 1;
        remaining_packet_len = packet.length - 1;
        decoded_packet = [header];
        offsets = [0];
    }

    while (remaining_packet_len > 0) {
        let var1, var2, var3, var4, var5, var6, var7, var8;

        var8 = remaining_packet_len;
        var5 = var8 - 1;
        remaining_packet_len = var5;
        offsets.push(packet_read_index);
        var3 = packet_read_index;
        var6 = packet_read_index + 1;
        packet_read_index = var6;

        var2 = packet[var3];
        var7 = (var2 ^ 255);
        var7 = Math.clz32(var7);
        var7 = var7 - 24;
        var7 = var7 & 255;

        switch (rotator_table[var7]) {
            case 1:
                decoded_packet.push(i64_as_f32(BigInt(var2)));
                break;
            case 2:
                var2 |= -64;
                decoded_packet.push(i64_as_f32(BigInt(var2) | -4294967296n));
                break;
            case 3:
                var3 = var7 - 2;
                remaining_packet_len = var5 - var3;
                var8 = var3 + var6;
                packet_read_index = var8;
                var1 = var7 + 25;
                var5 = (var2 << var1) >> var1;
                var2 = var5;
                block7: {
                    if (var3 == 0) break block7;
                    var4 = var3 & 7;
                    if (var4) {
                        var1 = var6;
                        var2 = var5;
                        while (var4) {
                            var2 = (var2 << 8) | packet[var1];
                            var6 = var1 + 1;
                            var1 = var6;
                            var4 = var4 - 1;
                        }
                    }
                }
                if (var5 < 0) {
                    decoded_packet.push(i64_as_f32(i64_extend_i32_u(var2) | -4294967296n));
                } else {
                    decoded_packet.push(i64_as_f32(i64_extend_i32_u(var2)));
                }
                break;
            case 4:
                decoded_packet.push(new Float32Array(packet.slice(packet_read_index, packet_read_index + 4).buffer)[0]);
                packet_read_index += 4;
                remaining_packet_len -= 4;
                break;
        }
    }
    return [decoded_packet, offsets];
}

class BroadcastParser {
    constructor() {
        this.global_minimap = {};
        this.team_minimap = {};
        this.leaderboard = {};
        this.decoder = new TextDecoder();
    }

    parse(packet) {
        let offset = 1;
        offset = this.parse_global_minimap_deletions(packet, offset);
        offset = this.parse_global_minimap(packet, offset);
        offset = this.parse_team_minimap_deletions(packet, offset);
        offset = this.parse_team_minimap(packet, offset);
        // Leaderboard parsing skipped as it's not needed for pathfinding
    }

    parse_global_minimap(packet, offset) {
        let len = packet[offset++];
        for (let iter = 0; iter < len; iter++) {
            let id = packet[offset++];
            let type = packet[offset++];
            this.global_minimap[id] = {
                type: type,
                x: packet[offset++],
                y: packet[offset++],
                color: packet[offset++],
                size: packet[offset++],
            }
        }
        return offset;
    }

    parse_global_minimap_deletions(packet, offset) {
        let len = packet[offset++];
        for (let iter = 0; iter < len; iter++) {
            delete this.global_minimap[packet[offset++]];
        }
        return offset;
    }

    parse_team_minimap(packet, offset) {
        let len = packet[offset++];
        for (let iter = 0; iter < len; iter++) {
            this.team_minimap[packet[offset++]] = {
                x: packet[offset++],
                y: packet[offset++],
                color: packet[offset++],
            }
        }
        return offset;
    }

    parse_team_minimap_deletions(packet, offset) {
        let len = packet[offset++];
        for (let iter = 0; iter < len; iter++) {
            delete this.team_minimap[packet[offset++]];
        }
        return offset;
    }
}

class RoomParser {
    constructor() {
        this.room_dimensions = [];
        this.grid = [];
    }

    parse(packet, game_data) {
        let split_game_data = game_data.split(",");
        for (let entry in split_game_data) {
            let current_data = split_game_data[entry].split("=");
            this[current_data[0]] = current_data[1];
        }
        this.room_dimensions = [Number(packet[0]), Number(packet[1]), Number(packet[2]), Number(packet[3])];
        let grid_width = packet[6];
        let grid_height = packet[7];
        this.grid = Array.from({
            length: grid_height
        }, () => Array.from({
            length: grid_width
        }, () => 0));
        let grid_data = packet.slice(8, packet.length);
        let iter = 0;
        for (let y = 0; y < grid_height; y++) {
            for (let x = 0; x < grid_width; x++) {
                this.grid[y][x] = grid_data[iter];
                iter++;
            }
        }
    }
}

class MazeMapManager {
    constructor() {
        this.map = undefined;
        this.room_width = 0;
        this.room_height = 0;
        this.node_half_width = 0;
        this.node_half_height = 0;
        this.map_width = 0;
        this.map_height = 0;
        this.encoding_shift = 0;
        this.pathfinding_dirs = [
            [-1, 0],
            [0, -1],
            [1, 0],
            [0, 1]
        ];
    }

    check_if_map_is_maze(global_minimap) {
        for (let id in global_minimap)
            if (global_minimap[id].type == 2) return true;
        return false;
    }

    parse_maze_map(room, global_minimap) {
        let sizes = {};
        for (let id in global_minimap)
            if (global_minimap[id].type == 2)
                if (!sizes[global_minimap[id].size]) sizes[global_minimap[id].size] = true;
        let sizes_values = Object.keys(sizes);
        let first_size = sizes_values[0];
        for (let iter = 1; iter < sizes_values.length; iter++)
            if (sizes_values[iter] < first_size) sizes_values[iter] = first_size;

        this.room_width = Number(room.room_dimensions[2]) - Number(room.room_dimensions[0]);
        this.room_height = Number(room.room_dimensions[3]) - Number(room.room_dimensions[1]);
        this.map_width = Math.trunc(this.room_width / Number(first_size) * 0.5);
        this.map_height = Math.trunc(this.room_height / Number(first_size) * 0.5);
        this.encoding_shift = this.map_height > 0 ? Math.ceil(Math.log2(this.map_height)) : 0;
        this.node_half_width = (this.room_width / this.map_width) * 0.5;
        this.node_half_height = (this.room_height / this.map_height) * 0.5;
        this.map = Array.from({
            length: this.map_height
        }, () => Array.from({
            length: this.map_width
        }, () => 0));

        let dx = 255 / this.map_width;
        let dy = 255 / this.map_height;
        for (let id in global_minimap) {
            if (global_minimap[id].type == 2) {
                let size = Math.trunc(global_minimap[id].size / first_size);
                let x_pos = Math.round((global_minimap[id].x - dx * (size / 2)) / dx);
                let y_pos = Math.round((global_minimap[id].y - dy * (size / 2)) / dy);
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        if (this.map[y_pos + y] && this.map[y_pos + y][x_pos + x] !== undefined) {
                            this.map[y_pos + y][x_pos + x] = global_minimap[id].color;
                        }
                    }
                }
            }
        }

        let room_grid_node_size = this.map_height / room.grid.length;
        for (let y = 0; y < room.grid.length; y++) {
            for (let x = 0; x < room.grid[0].length; x++) {
                if (room.grid[y][x] == 10 || room.grid[y][x] == 11 || room.grid[y][x] == 12 || room.grid[y][x] == 15) {
                    for (let height = 0; height < room_grid_node_size; height++) {
                        for (let width = 0; width < room_grid_node_size; width++) {
                            let map_y = Math.trunc(y * room_grid_node_size) + height;
                            let map_x = Math.trunc(x * room_grid_node_size) + width;
                            if (this.map[map_y] && this.map[map_y][map_x] !== undefined) {
                                this.map[map_y][map_x] = room.grid[y][x];
                            }
                        }
                    }
                }
            }
        }
    }

    parse_position_coordinate(x, y, room_dimensions) {
        let x_ratio = (x - room_dimensions[0]) / this.room_width;
        let y_ratio = (y - room_dimensions[1]) / this.room_height;
        if (x_ratio < 0) x_ratio = 0; else if (x_ratio > 1) x_ratio = 1;
        if (y_ratio < 0) y_ratio = 0; else if (y_ratio > 1) y_ratio = 1;
        return [Math.trunc(x_ratio * this.map_width), Math.trunc(y_ratio * this.map_height)];
    }

    find_path(i, f, color) {
        if (!this.map || this.map_height === 0) return [];
        let [start_x, start_y] = i;
        let [end_x, end_y] = f;
        if (start_x == end_x && start_y == end_y) return [];
        let start_encoded = (start_y << this.encoding_shift) | start_x;
        let end_encoded = (end_y << this.encoding_shift) | end_x;
        let queue = [start_encoded];
        let visited = new Set([start_encoded]);
        let parent_map = new Map();
        let path_found = false;
        let x_mask = (1 << this.encoding_shift) - 1;

        while (queue.length > 0) {
            let current_encoded = queue.shift();
            if (current_encoded == end_encoded) {
                path_found = true;
                break;
            }
            let curr_x = current_encoded & x_mask;
            let curr_y = current_encoded >> this.encoding_shift;
            for (let [dx, dy] of this.pathfinding_dirs) {
                let next_x = curr_x + dx;
                let next_y = curr_y + dy;
                if (next_x >= 0 && next_x < this.map_width && next_y >= 0 && next_y < this.map_height) {
                    let next_encoded = (next_y << this.encoding_shift) | next_x;
                    if (!visited.has(next_encoded)) {
                        let tile_value = this.map[next_y][next_x];
                        // 0 is empty, 17 is also usually empty/allowed, color matches player team
                        if (tile_value == 0 || tile_value == 17 || tile_value == color || next_encoded == end_encoded) {
                            visited.add(next_encoded);
                            parent_map.set(next_encoded, current_encoded);
                            queue.push(next_encoded);
                        }
                    }
                }
            }
        }
        if (!path_found) return [];
        let final_path = [];
        let current_step = parent_map.get(end_encoded);
        while (current_step != undefined && current_step != start_encoded) {
            final_path.push([current_step & x_mask, current_step >> this.encoding_shift]);
            current_step = parent_map.get(current_step);
        }
        return final_path.reverse();
    }
}

function yield_control_comps_from_angle(angle) {
    let cartesian_x_comp = -Math.cos(angle);
    let cartesian_y_comp = Math.sin(angle);
    let x_comp = Math.floor(Math.abs(cartesian_x_comp) * 64);
    let y_comp = Math.floor(Math.abs(cartesian_y_comp) * 64);
    if (cartesian_x_comp < 0) x_comp = 191 - x_comp;
    if (cartesian_y_comp > 0) y_comp = 191 - y_comp;
    return [x_comp, y_comp];
}

module.exports = {
    decode_packet,
    BroadcastParser,
    RoomParser,
    MazeMapManager,
    yield_control_comps_from_angle
};
