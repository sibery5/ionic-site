# Gerçekçi insan gövdeleri — kaynak ve lisans

`mh.bin` ve `mh.webp`, **MakeHuman** projesinin varlıklarından `scripts/assets/pack-mh.py` ile üretilir.

## Lisans
MakeHuman varlıkları (taban insan ağı, biçim hedefleri, iskelet ağırlıkları, kıyafet/saç/göz/kaş/kirpik ağları ve dokuları, cilt dokuları)
telif sahiplerince **CC0 1.0 Universal** olarak yayımlanmıştır: ticari kullanım serbest, atıf gerekmez.
Kaynak: resmî depo `github.com/makehumancommunity/makehuman`, `LICENSE.ASSETS.md` ("These assets have been released under CC0 1.0 Universal");
hedef dosyalarının başlığı: "This asset was explicitly released as CC0 in september 2020".
MakeHuman'ın **kodu** AGPL'dir; bu oyunda MakeHuman kodu kullanılmaz, yalnızca veri dosyaları dönüştürülür.

## Nereden alındı
| Veri | Kaynak |
|---|---|
| Biçim hedefleri (`macrodetails/*.target`) | resmî depo, `makehuman/data/targets` |
| Taban ağ, iskelet ağırlıkları, kıyafet/saç/göz/kaş/kirpik ağları ve dokuları, cilt dokuları | npm `makehuman-data@0.0.2` (aynı resmî varlıkların three.js biçimine çevrilmiş kopyası) |

Yalnızca MakeHuman'ın **resmî** varlıkları kullanılır (male/female casual-elegant-work-sport suit, shoes01–06, short01–04, afro01, bob01–02,
braid01, long01, ponytail01, eyebrow001/010, eyelashes02, low-poly eyes, young/middleage/old caucasian skins).
npm paketindeki topluluk katkılı parçalar (lisansı parça başına değişebilir) **kullanılmaz**.

## Yeniden üretme
```
npm pack makehuman-data && tar xzf makehuman-data-0.0.2.tgz          # -> package/public/data
git clone --depth 1 https://github.com/makehumancommunity/makehuman  # -> makehuman/data/targets
pip install numpy scipy pillow pyfqmr
python3 -I scripts/assets/pack-mh.py <package/public/data> <makehuman/makehuman/data/targets>
```

## İçerik
- 10 gövde tipi (erkek: orta, ince, iri, kaslı, yaşlı, yaşlı-iri; kadın: orta, ince, iri, yaşlı), bizim 27 kemikli iskeletimize oturtulmuş.
- 12 kıyafet, 6 ayakkabı, 10 saç, göz, 2 kaş, kirpik; her parça için üç uzaklık düzeyi.
- Doku atlası 4096×2048: kıyafet/saç dokuları gri ayrıntı haritasına çevrilir, renk oyundaki görünüş renginden gelir.
