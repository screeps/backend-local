const _ = require('lodash');

var BadgePaths = {

    1: {
        calc(param) {
            var vert = 0, hor = 0;
            if(param > 0) {
                vert = param * 30 / 100;
            }
            if(param < 0) {
                hor = -param * 30 / 100;
            }
            this.path1 = `M 50 ${100-vert} L ${hor} 50 H ${100-hor} Z`;
            this.path2 = `M ${hor} 50 H ${100-hor} L 50 ${vert} Z`;

        }
    },

    2: {
        calc(param) {
            var x = 0, y = 0;

            if(param > 0) {
                x = param * 30 / 100;
            }
            if(param < 0) {
                y = -param * 30 / 100;
            }

            this.path1 = `M ${x} ${y} L 50 50 L ${100-x} ${y} V -1 H -1 Z`;
            this.path2 = `M ${x} ${100-y} L 50 50 L ${100-x} ${100-y} V 101 H -1 Z`;
        }
    },

    3: {
        calc(param) {
            var angle = Math.PI/4 + Math.PI/4*(param+100)/200,
                angle1 = -Math.PI/2,
                angle2 = Math.PI/2 + Math.PI/3,
                angle3 = Math.PI/2 - Math.PI/3;

            this.path1 = `M 50 50 L ${50+100*Math.cos(angle1-angle/2)} ${50+100*Math.sin(angle1-angle/2)} L ${50+100*Math.cos(angle1+angle/2)} ${50+100*Math.sin(angle1+angle/2)} Z`;
            this.path2 = `M 50 50 L ${50+100*Math.cos(angle2-angle/2)} ${50+100*Math.sin(angle2-angle/2)} L ${50+100*Math.cos(angle2+angle/2)} ${50+100*Math.sin(angle2+angle/2)} Z
                          M 50 50 L ${50+100*Math.cos(angle3-angle/2)} ${50+100*Math.sin(angle3-angle/2)} L ${50+100*Math.cos(angle3+angle/2)} ${50+100*Math.sin(angle3+angle/2)}`;
        },
        flip: 'rotate180'
    },

    4: {
        calc(param) {
            param += 100;
            var y1 = 50 - param * 30 / 200,
                y2 = 50 + param * 30 / 200;

            this.path1 = `M 0 ${y2} H 100 V 100 H 0 Z`;
            this.path2 = param > 0 ? `M 0 ${y1} H 100 V ${y2} H 0 Z` : '';
        },
        flip: 'rotate90'
    },

    5: {
        calc(param) {
            param += 100;
            var x1 = 50 - param * 10 / 200 - 10,
                x2 = 50 + param * 10 / 200 + 10;

            this.path1 = `M ${x1} 0 H ${x2} V 100 H ${x1} Z`;
            this.path2 = `M 0 ${x1} H 100 V ${x2} H 0 Z`;
        },
        flip: 'rotate45'
    },

    6: {
        calc(param) {
            var width = 5 + (param+100) * 8 / 200,
                x1 = 50, x2 = 20, x3 = 80;

            this.path1 = `M ${x1-width} 0 H ${x1+width} V 100 H ${x1-width}`;
            this.path2 = `M ${x2-width} 0 H ${x2+width} V 100 H ${x2-width} Z
                          M ${x3-width} 0 H ${x3+width} V 100 H ${x3-width} Z`;
        },
        flip: 'rotate90'
    },

    7: {
        calc(param) {
            var w = 20 + param * 10 / 100;

            this.path1 = `M 0 50 Q 25 30 50 50 T 100 50 V 100 H 0 Z`;
            this.path2 = `M 0 ${50-w} Q 25 ${30-w} 50 ${50-w} T 100 ${50-w}
                            V ${50+w} Q 75 ${70+w} 50 ${50+w} T 0 ${50+w} Z`;
        },
        flip: 'rotate90'
    },

    8: {
        calc(param) {
            var y = param * 20 / 100;

            this.path1 = `M 0 50 H 100 V 100 H 0 Z`;
            this.path2 = `M 0 50 Q 50 ${y} 100 50 Q 50 ${100-y} 0 50 Z`;
        },
        flip: 'rotate90'
    },

    9: {
        calc(param) {
            var y1 = 0, y2 = 50, h = 70;
            if(param > 0) y1 += param/100*20;
            if(param < 0) y2 += param/100*30;

            this.path1 = `M 50 ${y1} L 100 ${y1+h} V 101 H 0 V ${y1+h} Z`;
            this.path2 = `M 50 ${y1+y2} L 100 ${y1+y2+h} V 101 H 0 V ${y1+y2+h} Z`;
        },
        flip: 'rotate180'
    },

    10: {
        calc(param) {
            var r = 30, d = 7;

            if(param > 0) r += param*50/100;
            if(param < 0) d -= param*20/100;

            this.path1 = `M ${50+d+r} ${50-r} A ${r} ${r} 0 0 0 ${50+d+r} ${50+r} H 101 V ${50-r} Z`;
            this.path2 = `M ${50-d-r} ${50-r} A ${r} ${r} 0 0 1 ${50-d-r} ${50+r} H -1 V ${50-r} Z`;
        },
        flip: 'rotate90'
    },

    11: {
        calc(param) {
            var a1 = 30, a2 = 30, x = 50 - 50*Math.cos(Math.PI/4), y = 50 - 50*Math.sin(Math.PI/4);

            if(param > 0) {
                a1 += param*25/100;
                a2 += param*25/100;
            }
            if(param < 0) {
                a2 -= param*50/100;
            }

            this.path1 = `M ${x} ${y} Q ${a1} 50 ${x} ${100-y} H 0 V ${y} Z
                          M ${100-x} ${y} Q ${100-a1} 50 ${100-x} ${100-y} H 100 V ${y} Z`;
            this.path2 = `M ${x} ${y} Q 50 ${a2} ${100-x} ${y} V 0 H ${x} Z
                          M ${x} ${100-y} Q 50 ${100-a2} ${100-x} ${100-y} V 100 H ${x} Z`;

        },
        flip: 'rotate90'
    },

    12: {
        calc(param) {
            var a1 = 30, a2 = 35;

            if(param > 0) a1 += param * 30 / 100;
            if(param < 0) a2 += param * 15 / 100;

            this.path1 = `M 0 ${a1} H 100 V 100 H 0 Z`;
            this.path2 = `M 0 ${a1} H ${a2} V 100 H 0 Z
                          M 100 ${a1} H ${100-a2} V 100 H 100 Z`;

        },
        flip: 'rotate180'
    },

    13: {
        calc(param) {
            var r = 30, d = 0;

            if(param > 0) r += param * 50 / 100;
            if(param < 0) d -= param * 20 / 100;

            this.path1 = `M 0 0 H 50 V 100 H 0 Z`;
            this.path2 = `M ${50-r} ${50-d-r} A ${r} ${r} 0 0 0 ${50+r} ${50-r-d} V 0 H ${50-r} Z`;

        },
        flip: 'rotate180'
    },

    14: {
        calc(param) {
            var a = Math.PI/4,
                d = 0;

            a += param * Math.PI/4 / 100;

            this.path1 = `M 50 0 Q 50 ${50+d} ${50 + 50*Math.cos(a)} ${50 + 50*Math.sin(a)} H 100 V 0 H 50 Z`;
            this.path2 = `M 50 0 Q 50 ${50+d} ${50 - 50*Math.cos(a)} ${50 + 50*Math.sin(a)} H 0 V 0 H 50 Z`;

        },
        flip: 'rotate180'
    },

    15: {
        calc(param) {
            var w = 13 + param * 6 / 100,
                r1 = 80, r2 = 45, d = 10;

            this.path1 = `M ${50-r1-w} ${100+d} A ${r1+w} ${r1+w} 0 0 1 ${50+r1+w} ${100+d}
                                   H ${50+r1-w} A ${r1-w} ${r1-w} 0 1 0 ${50-r1+w} ${100+d}`;
            this.path2 = `M ${50-r2-w} ${100+d} A ${r2+w} ${r2+w} 0 0 1 ${50+r2+w} ${100+d}
                                   H ${50+r2-w} A ${r2-w} ${r2-w} 0 1 0 ${50-r2+w} ${100+d}`;

        },
        flip: 'rotate180'
    },

    16: {
        calc(param) {
            var a = 30 * Math.PI / 180, d = 25;

            if(param > 0) {
                a += 30 * Math.PI / 180 * param / 100;
            }
            if(param < 0) {
                d += param * 25 / 100;
            }

            this.path1 = '';
            for(var i=0; i<3; i++) {
                var angle1 = i * Math.PI*2/3 + a/2 - Math.PI/2,
                    angle2 = i * Math.PI*2/3 - a/2 - Math.PI/2;

                this.path1 += `M ${50+100*Math.cos(angle1)} ${50+100*Math.sin(angle1)}
                               L ${50+100*Math.cos(angle2)} ${50+100*Math.sin(angle2)}
                               L ${50+d*Math.cos(angle2)} ${50+d*Math.sin(angle2)}
                               A ${d} ${d} 0 0 1 ${50+d*Math.cos(angle1)} ${50+d*Math.sin(angle1)} Z`;
            }

            this.path2 = '';
            for(var i=0; i<3; i++) {
                var angle1 = i * Math.PI*2/3 + a/2 + Math.PI/2,
                    angle2 = i * Math.PI*2/3 - a/2 + Math.PI/2;

                this.path2 += `M ${50+100*Math.cos(angle1)} ${50+100*Math.sin(angle1)}
                               L ${50+100*Math.cos(angle2)} ${50+100*Math.sin(angle2)}
                               L ${50+d*Math.cos(angle2)} ${50+d*Math.sin(angle2)}
                               A ${d} ${d} 0 0 1 ${50+d*Math.cos(angle1)} ${50+d*Math.sin(angle1)} Z`;
            }

        }
    },

    17: {
        calc(param) {
            var w = 35, h = 45;

            if(param > 0) {
                w += param * 20 / 100;
            }
            if(param < 0) {
                h  -= param * 30 / 100;
            }

            this.path1 = `M 50 45 L ${50-w} ${h+45} H ${50+w} Z`;
            this.path2 = `M 50 0 L ${50-w} ${h} H ${50+w} Z`;


        }
    },

    18: {
        calc(param) {
            var a = 90 * Math.PI / 180, d = 10;

            if(param > 0) {
                a -= 60 / 180 * Math.PI * param / 100;
            }
            if(param < 0) {
                d -= param * 15 / 100;
            }

            this.path1 = '';
            this.path2 = '';
            for(var i=0;i<3;i++) {

                var angle1 = Math.PI*2/3*i + a/2 - Math.PI/2,
                    angle2 = Math.PI*2/3*i - a/2 - Math.PI/2,
                    path = `M ${50 + 100 * Math.cos(angle1)} ${50+100*Math.sin(angle1)}
                            L ${50 + 100 * Math.cos(angle2)} ${50+100*Math.sin(angle2)}
                            L ${50+d*Math.cos((angle1+angle2)/2)} ${50+d*Math.sin((angle1+angle2)/2)} Z`;

                if(!i) {
                    this.path1 += path;
                }
                else {
                    this.path2 += path;
                }
            }
        },
        flip: 'rotate180'
    },

    19: {
        calc(param) {
            var w2 = 20, w1 = 60;

            w1 += param * 20 / 100;
            w2 += param * 20 / 100;

            this.path1 = `M 50 -10 L ${50-w1} 100 H ${50+w1} Z`;
            this.path2 = '';
            if(w2 > 0) {
                this.path2 = `M 50 0 L ${50-w2} 100 H ${50+w2} Z`
            }
        },
        flip: 'rotate180'
    },

    20: {
        calc(param) {
            var w = 10, h = 20;

            if(param > 0) w += param * 20 / 100;
            if(param < 0) h += param * 40 / 100;

            this.path1 = `M 0 ${50-h} H ${50-w} V 100 H 0 Z`;
            this.path2 = `M ${50+w} 0 V ${50+h} H 100 V 0 Z`
        },
        flip: 'rotate90'
    },

    21: {
        calc(param) {
            var w = 40, h = 50;

            if(param > 0) w -= param * 20 / 100;
            if(param < 0) h += param * 20 / 100;

            this.path1 = `M 50 ${h} Q ${50+w} 0 50 0 T 50 ${h} Z
                          M 50 ${100-h} Q ${50+w} 100 50 100 T 50 ${100-h} Z`;
            this.path2 = `M ${h} 50 Q 0 ${50+w} 0 50 T ${h} 50 Z
                          M ${100-h} 50 Q 100 ${50+w} 100 50 T ${100-h} 50 Z`;
        },
        flip: 'rotate45'
    },

    22: {
        calc(param) {
            var w = 20;

            w += param * 10 / 100;

            this.path1 = `M ${50-w} ${50-w} H ${50+w} V ${50+w} H ${50-w} Z`;
            this.path2 = '';

            for(var i=-4;i<4;i++) {
                for(var j=-4;j<4;j++) {
                    var a = (i+j)%2;
                    this.path2 += `M ${50 - w - w * 2 * i} ${50 - w - w*2*(j+a)} h ${-w * 2} v ${w*2} h ${w * 2} Z`;
                }
            }
        },
        flip: 'rotate45'
    },

    23: {
        calc(param) {
            var w = 17, h = 25;

            if(param > 0) w += param * 35 / 100;
            if(param < 0) h -= param * 23 / 100;

            this.path1 = '';
            for(var i=-4; i<=4; i++) {
                this.path1 += `M ${50 - w*i*2} ${50-h} l ${-w} ${-h} l ${-w} ${h} l ${w} ${h} Z`
            }
            this.path2 = '';
            for(var i=-4; i<=4; i++) {
                this.path2 += `M ${50 - w*i*2} ${50+h} l ${-w} ${-h} l ${-w} ${h} l ${w} ${h} Z`
            }
        },
        flip: 'rotate90'
    },

    24: {
        calc(param) {
            var w = 50, h = 45;

            if(param > 0) w += param * 60 / 100;
            if(param < 0) h += param * 30 / 100;

            this.path1 = `M 0 ${h} L 50 70 L 100 ${h} V 100 H 0 Z`;
            this.path2 = `M 50 0 L ${50+w} 100 H 100 V ${h} L 50 70 L 0 ${h} V 100 H ${50-w} Z`;
        },
        flip: 'rotate180'
    },
};

function hsl2rgb(H, S, L) {

    /*
     * H ∈ [0°, 360°)
     * S ∈ [0, 1]
     * L ∈ [0, 1]
     */

    /* calculate chroma */
    var C = (1 - Math.abs((2 * L) - 1)) * S;

    /* Find a point (R1, G1, B1) along the bottom three faces of the RGB cube, with the same hue and chroma as our color (using the intermediate value X for the second largest component of this color) */
    var H_ = H / 60;

    var X = C * (1 - Math.abs((H_ % 2) - 1));

    var R1, G1, B1;

    if (H === undefined || isNaN(H) || H === null) {
        R1 = G1 = B1 = 0;
    }
    else {

        if (H_ >= 0 && H_ < 1) {
            R1 = C;
            G1 = X;
            B1 = 0;
        }
        else if (H_ >= 1 && H_ < 2) {
            R1 = X;
            G1 = C;
            B1 = 0;
        } else if (H_ >= 2 && H_ < 3) {
            R1 = 0;
            G1 = C;
            B1 = X;
        } else if (H_ >= 3 && H_ < 4) {
            R1 = 0;
            G1 = X;
            B1 = C;
        } else if (H_ >= 4 && H_ < 5) {
            R1 = X;
            G1 = 0;
            B1 = C;
        }
        else if (H_ >= 5 && H_ < 6) {
            R1 = C;
            G1 = 0;
            B1 = X;
        }
    }

    /* Find R, G, and B by adding the same amount to each component, to match lightness */

    var m = L - (C / 2);

    var R, G, B;

    /* Normalise to range [0,255] by multiplying 255 */
    R = (R1 + m) * 255;
    G = (G1 + m) * 255;
    B = (B1 + m) * 255;

    R = Math.round(R);
    G = Math.round(G);
    B = Math.round(B);

    function pad(v) {
        var hex = Number(v).toString(16);
        if(hex.length < 2) {
            hex = '0'+hex;
        }
        return hex;
    }

    return pad(R)+pad(G)+pad(B);
}

var colors = [], index=0;
colors.push({index: index++, rgb: '#'+hsl2rgb(0,0,0.8)});
for(var i=0; i<19; i++) {
    colors.push({index: index++, rgb: '#'+hsl2rgb(i * 360 / 19,0.6,0.8)});
}
colors.push({index: index++, rgb: '#'+hsl2rgb(0,0,0.5)});
for(var i=0; i<19; i++) {
    colors.push({index: index++, rgb: '#'+hsl2rgb(i * 360 / 19,0.7,0.5)});
}
colors.push({index: index++, rgb: '#'+hsl2rgb(0,0,0.3)});
for(var i=0; i<19; i++) {
    colors.push({index: index++, rgb: '#'+hsl2rgb(i * 360 / 19,0.4,0.3)});
}
colors.push({index: index++, rgb: '#'+hsl2rgb(0,0,0.1)});
for(var i=0; i<19; i++) {
    colors.push({index: index++, rgb: '#'+hsl2rgb(i * 360 / 19,0.5,0.1)});
}

function getBadgeSvg(badgeInfo) {

    var color1 = _.isString(badgeInfo.color1) ? badgeInfo.color1 : colors[badgeInfo.color1].rgb,
        color2 = _.isString(badgeInfo.color2) ? badgeInfo.color2 : colors[badgeInfo.color2].rgb,
        color3 = _.isString(badgeInfo.color3) ? badgeInfo.color3 : colors[badgeInfo.color3].rgb;

    if(_.isNumber(badgeInfo.type)) {
        BadgePaths[badgeInfo.type].calc(badgeInfo.param);
    }

    var rotate = 0;

    if(badgeInfo.flip && _.isNumber(badgeInfo.type)) {
        if(BadgePaths[badgeInfo.type].flip == 'rotate180') {
            rotate = 180;
        }
        if(BadgePaths[badgeInfo.type].flip == 'rotate90') {
            rotate = 90;
        }
        if(BadgePaths[badgeInfo.type].flip == 'rotate45') {
            rotate = 45;
        }
    }


    var svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 100 100" shape-rendering="geometricPrecision">
                            <defs>
                                <clipPath id="clip">
                                    <circle cx="50" cy="50" r="52" />
                                    <!--<rect x="0" y="0" width="100" height="100"/>-->
                                </clipPath>
                            </defs>
                            <g transform="rotate(${rotate} 50 50)">
                            <rect x="0" y="0" width="100" height="100" fill="${color1}" clip-path="url(#clip)"/>`;

    var path1,path2;

    if(_.isNumber(badgeInfo.type)) {
        path1 = BadgePaths[badgeInfo.type].path1;
        path2 = BadgePaths[badgeInfo.type].path2;
    }
    else {
        path1 = badgeInfo.type.path1;
        path2 = badgeInfo.type.path2;
    }

    svg += `<path d="${path1}" fill="${color2}" clip-path="url(#clip)"/>`;

    if (path2) {
        svg += `<path d="${path2}" fill="${color3}" clip-path="url(#clip)"/>`;
    }

    svg += `</g></svg>`;

    return svg;
}

module.exports = {getBadgeSvg};