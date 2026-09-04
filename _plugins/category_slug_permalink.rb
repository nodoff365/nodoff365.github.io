
# 글 주소(퍼멀링크)의 카테고리 구간에서 공백을 제거한다. 예:
#   /클라우드 기초/azure/제목/ -> /클라우드기초/azure/제목/
# 카테고리 표시 텍스트(사이드바, 브레드크럼, 칩 등)는 그대로 유지되고
# URL 생성에만 영향을 준다. assets/js/main.js의 normalizeFilterValue와
# 동일한 규칙(NFC 정규화 + 소문자화 + 공백 제거)을 적용해 필터 링크와
# 실제 글 주소가 항상 일치하도록 맞춘다.
module CategorySlugPermalink
  def self.normalize(value)
    value.to_s.unicode_normalize(:nfc).downcase.gsub(/\s+/, "")
  end

  class Generator < Jekyll::Generator
    priority :highest

    def generate(site)
      site.posts.docs.each do |post|
        next if post.data["permalink"]

        categories = post.data["categories"] || []
        next if categories.empty?

        title_slug = Jekyll::Utils.slugify(post.data["slug"], :mode => "pretty", :cased => true) ||
          Jekyll::Utils.slugify(post.basename_without_ext, :mode => "pretty", :cased => true)
        segments = categories.map { |c| CategorySlugPermalink.normalize(c) } + [title_slug]
        post.data["permalink"] = "/#{segments.join('/')}/"
      end
    end
  end
end
